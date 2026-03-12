/**
 * Registry backfill script
 *
 * Scans all CreatorRegistered events from the NftFactoryRegistry and upserts
 * every discovered collection + its minted tokens into the local indexer DB.
 *
 * Usage:
 *   npm run admin:backfill-registry -- [fromBlock]
 *
 * fromBlock defaults to 0.  Pass the registry deployment block to speed things up:
 *   npm run admin:backfill-registry -- 10359500
 */

import "dotenv/config";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";
import { createPublicClient, http, isAddress } from "viem";
import { getCollectionScanFromBlock, getRegistryBackfillChain } from "../src/registryBackfill.js";

const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS || "";
const RPC_URL = process.env.RPC_URL || "";
const CHAIN_ID = Number.parseInt(process.env.CHAIN_ID || "11155111", 10);
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const FROM_BLOCK = BigInt(process.argv[2] || "0");

const prisma = new PrismaClient();

// ── ABIs ────────────────────────────────────────────────────────────────────

const creatorRegisteredEvent = {
  type: "event",
  name: "CreatorRegistered",
  inputs: [
    { indexed: true, name: "creator", type: "address" },
    { indexed: true, name: "contractAddress", type: "address" },
    { indexed: false, name: "ensSubname", type: "string" },
    { indexed: false, name: "standard", type: "string" },
    { indexed: false, name: "isNftFactoryCreated", type: "bool" }
  ]
} as const;

const erc721TransferEvent = {
  type: "event",
  name: "Transfer",
  inputs: [
    { indexed: true, name: "from", type: "address" },
    { indexed: true, name: "to", type: "address" },
    { indexed: true, name: "tokenId", type: "uint256" }
  ]
} as const;

const erc1155TransferSingleEvent = {
  type: "event",
  name: "TransferSingle",
  inputs: [
    { indexed: true, name: "operator", type: "address" },
    { indexed: true, name: "from", type: "address" },
    { indexed: true, name: "to", type: "address" },
    { indexed: false, name: "id", type: "uint256" },
    { indexed: false, name: "value", type: "uint256" }
  ]
} as const;

const erc1155TransferBatchEvent = {
  type: "event",
  name: "TransferBatch",
  inputs: [
    { indexed: true, name: "operator", type: "address" },
    { indexed: true, name: "from", type: "address" },
    { indexed: true, name: "to", type: "address" },
    { indexed: false, name: "ids", type: "uint256[]" },
    { indexed: false, name: "values", type: "uint256[]" }
  ]
} as const;

const ownableAbi = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] }
] as const;

const erc165Abi = [
  {
    type: "function",
    name: "supportsInterface",
    stateMutability: "view",
    inputs: [{ name: "interfaceId", type: "bytes4" }],
    outputs: [{ name: "", type: "bool" }]
  }
] as const;

const erc721Abi = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }]
  }
] as const;

const erc1155Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }, { name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "uri",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "string" }]
  }
] as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function isRangeTooLargeError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err);
  // Match Alchemy / standard node messages for oversized getLogs ranges.
  // Deliberately excludes the generic -32600 "Invalid Request" code because Alchemy
  // emits that for transient errors too, which would incorrectly halve the chunk size.
  return (
    msg.includes("block range") ||
    msg.includes("Block range") ||
    msg.includes("Log response size exceeded") ||
    msg.includes("query returned more than") ||
    msg.includes("eth_getLogs is limited") ||
    msg.includes("-32602") // JSON-RPC "Invalid params" — Alchemy's range-too-large code
  );
}

function isRateLimitError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err);
  return msg.includes("429") || msg.toLowerCase().includes("too many requests");
}

/** Max tokens per multicall round-trip (each token = 2 calls, so 75 tokens = 150 calls). */
const MULTICALL_BATCH = 75;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Retry any async fn on 429 / too-many-requests with exponential back-off. */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 6): Promise<T> {
  let retryDelay = 1500;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxRetries || !isRateLimitError(err)) throw err;
      process.stdout.write(`r`);
      await sleep(retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30_000);
    }
  }
}

async function getLogsChunked(client: any, params: any, label: string, initialChunkSize = 200n): Promise<any[]> {
  const currentBlock = await withRetry(() => client.getBlockNumber());
  const fromBlock: bigint = params.fromBlock ?? 0n;
  const toBlock: bigint = params.toBlock ?? currentBlock;

  console.log(`  [${label}] scanning blocks ${fromBlock}–${toBlock}`);

  const allLogs: any[] = [];
  let chunkSize = initialChunkSize;
  let start = fromBlock;
  let chunks = 0;

  while (start <= toBlock) {
    const end = start + chunkSize - 1n > toBlock ? toBlock : start + chunkSize - 1n;
    let retryDelay = 2000;
    let advanced = false;

    while (!advanced) {
      try {
        const chunk = await client.getLogs({ ...params, fromBlock: start, toBlock: end });
        allLogs.push(...chunk);
        start = end + 1n;
        chunks++;
        advanced = true;
        await sleep(300); // inter-chunk pause to stay within CU budget
      } catch (err) {
        if (isRateLimitError(err)) {
          process.stdout.write(`r`);
          await sleep(retryDelay);
          retryDelay = Math.min(retryDelay * 2, 30_000);
        } else if (isRangeTooLargeError(err) && chunkSize > 1n) {
          const preview = (err instanceof Error ? err.message : String(err)).split("\n")[0].slice(0, 120);
          process.stdout.write(`\n  [${label}] halving chunk ${chunkSize}→${chunkSize / 2n}: ${preview}\n`);
          chunkSize = chunkSize / 2n < 1n ? 1n : chunkSize / 2n;
          break;
        } else {
          throw err;
        }
      }
    }

    if (chunks % 20 === 0) {
      process.stdout.write(`.`);
    }
  }

  console.log(`\n  [${label}] done — ${allLogs.length} logs in ${chunks} chunks`);
  return allLogs;
}

// ── Checkpoint ───────────────────────────────────────────────────────────────

const CHECKPOINT_FILE = resolve(process.cwd(), ".backfill-checkpoint.json");

type CheckpointData = {
  fromBlock: string;
  completedCollections: string[];
};

function loadCheckpoint(fromBlock: bigint): Set<string> {
  if (!existsSync(CHECKPOINT_FILE)) return new Set();
  try {
    const data = JSON.parse(readFileSync(CHECKPOINT_FILE, "utf8")) as CheckpointData;
    if (data.fromBlock !== fromBlock.toString()) {
      console.log(`[checkpoint] fromBlock mismatch (saved=${data.fromBlock} current=${fromBlock}) — ignoring old checkpoint`);
      return new Set();
    }
    if (data.completedCollections.length > 0) {
      console.log(`[checkpoint] resuming — ${data.completedCollections.length} collection(s) already done, skipping them`);
    }
    return new Set(data.completedCollections.map((a) => a.toLowerCase()));
  } catch {
    return new Set();
  }
}

function saveCheckpoint(fromBlock: bigint, completedCollections: Set<string>) {
  const data: CheckpointData = {
    fromBlock: fromBlock.toString(),
    completedCollections: [...completedCollections]
  };
  writeFileSync(CHECKPOINT_FILE, JSON.stringify(data, null, 2));
}

// ── Core logic ───────────────────────────────────────────────────────────────

async function upsertCollection(contractAddress: string, fields: {
  ownerAddress: string;
  ensSubname: string | null;
  standard: string;
  isFactoryCreated: boolean;
  isUpgradeable: boolean;
}) {
  return prisma.collection.upsert({
    where: { contractAddress },
    update: {
      ownerAddress: fields.ownerAddress,
      ensSubname: fields.ensSubname ?? undefined,
      standard: fields.standard,
      isFactoryCreated: fields.isFactoryCreated,
      isUpgradeable: fields.isUpgradeable
    },
    create: {
      chainId: CHAIN_ID,
      contractAddress,
      ownerAddress: fields.ownerAddress,
      ensSubname: fields.ensSubname,
      standard: fields.standard,
      isFactoryCreated: fields.isFactoryCreated,
      isUpgradeable: fields.isUpgradeable
    }
  });
}

async function upsertToken(collectionId: string, fields: {
  tokenId: string;
  creatorAddress: string;
  ownerAddress: string;
  metadataCid: string;
  mintTxHash: string | null;
  immutable: boolean;
}) {
  return (prisma.token as any).upsert({
    where: { collectionId_tokenId: { collectionId, tokenId: fields.tokenId } },
    update: {
      creatorAddress: fields.creatorAddress,
      ownerAddress: fields.ownerAddress,
      metadataCid: fields.metadataCid,
      mintTxHash: fields.mintTxHash,
      immutable: fields.immutable
    },
    create: {
      collectionId,
      tokenId: fields.tokenId,
      creatorAddress: fields.creatorAddress,
      ownerAddress: fields.ownerAddress,
      metadataCid: fields.metadataCid,
      mintTxHash: fields.mintTxHash,
      immutable: fields.immutable
    }
  });
}

async function backfillCollection(client: any, collection: {
  contractAddress: string;
  creator: string;
  standard: string;
  ensSubname: string;
  isNftFactoryCreated: boolean;
}, fromBlock: bigint) {
  const addr = collection.contractAddress as `0x${string}`;
  let standard = collection.standard;

  // Resolve on-chain owner
  let ownerAddress = collection.creator;
  try {
    const onchainOwner = String(await client.readContract({ address: addr, abi: ownableAbi, functionName: "owner" })).toLowerCase();
    if (isAddress(onchainOwner)) ownerAddress = onchainOwner;
  } catch { /* not ownable or failed */ }

  // Auto-detect standard if missing
  if (standard !== "ERC721" && standard !== "ERC1155") {
    try {
      const [is721, is1155] = await Promise.all([
        client.readContract({ address: addr, abi: erc165Abi, functionName: "supportsInterface", args: ["0x80ac58cd"] }).catch(() => false),
        client.readContract({ address: addr, abi: erc165Abi, functionName: "supportsInterface", args: ["0xd9b67a26"] }).catch(() => false)
      ]);
      standard = is721 ? "ERC721" : is1155 ? "ERC1155" : "";
    } catch { standard = ""; }
  }

  if (standard !== "ERC721" && standard !== "ERC1155") {
    console.log(`  ✗ ${addr}: could not determine standard — skipping`);
    return { scanned: 0, upserted: 0 };
  }

  const col = await upsertCollection(collection.contractAddress, {
    ownerAddress,
    ensSubname: collection.ensSubname || null,
    standard,
    isFactoryCreated: collection.isNftFactoryCreated,
    isUpgradeable: true
  });

  let scanned = 0;
  let upserted = 0;

  if (standard === "ERC721") {
    const logs = await getLogsChunked(client, { address: addr, event: erc721TransferEvent, fromBlock }, `${addr} ERC721`);
    const mints = logs.filter((l: any) => String(l.args?.from || "").toLowerCase() === ZERO_ADDRESS);
    scanned = mints.length;

    for (const batch of chunkArray(mints, MULTICALL_BATCH)) {
      // 2 calls per token (ownerOf + tokenURI) → interleaved in one multicall
      const contracts = batch.flatMap((log: any) => {
        const tokenId: bigint = log.args?.tokenId ?? 0n;
        return [
          { address: addr, abi: erc721Abi, functionName: "ownerOf" as const, args: [tokenId] },
          { address: addr, abi: erc721Abi, functionName: "tokenURI" as const, args: [tokenId] }
        ];
      });

      const results = await withRetry(() => client.multicall({ contracts, allowFailure: true }));

      for (let i = 0; i < batch.length; i++) {
        const log = batch[i];
        const tokenId = log.args?.tokenId?.toString();
        if (!tokenId) continue;

        const ownerRes = results[2 * i];
        const uriRes = results[2 * i + 1];

        const currentOwner =
          ownerRes?.status === "success" && isAddress(String(ownerRes.result))
            ? String(ownerRes.result).toLowerCase()
            : ownerAddress;

        const metadataCid = uriRes?.status === "success" ? String(uriRes.result) : "";
        if (!metadataCid) continue;

        await upsertToken(col.id, {
          tokenId,
          creatorAddress: ownerAddress,
          ownerAddress: currentOwner,
          metadataCid,
          mintTxHash: log.transactionHash,
          immutable: !col.isUpgradeable
        });
        upserted++;
      }

      await sleep(200); // throttle between multicall batches
    }
  } else {
    // Run sequentially to halve the instantaneous RPC burst compared to Promise.all
    const singleLogs = await getLogsChunked(client, { address: addr, event: erc1155TransferSingleEvent, fromBlock }, `${addr} 1155-single`);
    const batchLogs  = await getLogsChunked(client, { address: addr, event: erc1155TransferBatchEvent,  fromBlock }, `${addr} 1155-batch`);

    const tokenIds = new Map<string, string>(); // tokenId → mintTxHash
    for (const log of singleLogs) {
      if (String(log.args?.from || "").toLowerCase() !== ZERO_ADDRESS) continue;
      const id = log.args?.id?.toString();
      if (id && !tokenIds.has(id)) tokenIds.set(id, log.transactionHash);
    }
    for (const log of batchLogs) {
      if (String(log.args?.from || "").toLowerCase() !== ZERO_ADDRESS) continue;
      for (const id of log.args?.ids || []) {
        const tokenId = id.toString();
        if (!tokenIds.has(tokenId)) tokenIds.set(tokenId, log.transactionHash);
      }
    }

    scanned = tokenIds.size;
    const tokenIdList = [...tokenIds.entries()]; // [tokenId, mintTxHash][]

    for (const batch of chunkArray(tokenIdList, MULTICALL_BATCH)) {
      // 2 calls per token (balanceOf + uri) → interleaved in one multicall
      const contracts = batch.flatMap(([tokenId]) => [
        { address: addr, abi: erc1155Abi, functionName: "balanceOf" as const, args: [ownerAddress as `0x${string}`, BigInt(tokenId)] },
        { address: addr, abi: erc1155Abi, functionName: "uri"       as const, args: [BigInt(tokenId)] }
      ]);

      const results = await withRetry(() => client.multicall({ contracts, allowFailure: true }));

      for (let i = 0; i < batch.length; i++) {
        const [tokenId, mintTxHash] = batch[i];
        const balRes = results[2 * i];
        const uriRes = results[2 * i + 1];

        const balance = balRes?.status === "success" ? BigInt(String(balRes.result)) : 0n;
        if (balance <= 0n) continue;

        const metadataCid = uriRes?.status === "success" ? String(uriRes.result) : "";
        if (!metadataCid) continue;

        await upsertToken(col.id, {
          tokenId,
          creatorAddress: ownerAddress,
          ownerAddress,
          metadataCid,
          mintTxHash,
          immutable: true
        });
        upserted++;
      }

      await sleep(200); // throttle between multicall batches
    }
  }

  return { scanned, upserted };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!REGISTRY_ADDRESS || !isAddress(REGISTRY_ADDRESS)) {
    throw new Error(`Invalid or missing REGISTRY_ADDRESS: "${REGISTRY_ADDRESS}"`);
  }
  if (!RPC_URL.trim()) {
    throw new Error("Missing RPC_URL");
  }

  const client = createPublicClient({ chain: getRegistryBackfillChain(CHAIN_ID), transport: http(RPC_URL) });

  console.log(`Registry backfill`);
  console.log(`  Registry : ${REGISTRY_ADDRESS}`);
  console.log(`  Chain    : ${CHAIN_ID}`);
  console.log(`  From     : block ${FROM_BLOCK}`);
  console.log();

  // Step 1 — discover all registered collections
  console.log("Step 1: scanning registry for CreatorRegistered events…");
  const registryLogs = await getLogsChunked(client, {
    address: REGISTRY_ADDRESS as `0x${string}`,
    event: creatorRegisteredEvent,
    fromBlock: FROM_BLOCK
  }, "registry");

  const collectionMap = new Map<string, {
    creator: string;
    contractAddress: string;
    ensSubname: string;
    standard: string;
    isNftFactoryCreated: boolean;
    registeredAtBlock: bigint;
  }>();

  for (const log of registryLogs) {
    const addr = String(log.args?.contractAddress || "").toLowerCase();
    const creator = String(log.args?.creator || "").toLowerCase();
    if (!isAddress(addr) || !isAddress(creator)) continue;
    collectionMap.set(addr, {
      creator,
      contractAddress: addr,
      ensSubname: String(log.args?.ensSubname || "").trim(),
      standard: String(log.args?.standard || "").trim().toUpperCase(),
      isNftFactoryCreated: Boolean(log.args?.isNftFactoryCreated),
      registeredAtBlock: BigInt(log.blockNumber ?? FROM_BLOCK)
    });
  }

  console.log(`\nDiscovered ${collectionMap.size} collections:`);
  for (const c of collectionMap.values()) {
    console.log(`  ${c.contractAddress} (${c.standard || "?"}) creator=${c.creator} ens=${c.ensSubname || "-"} factory=${c.isNftFactoryCreated} block=${c.registeredAtBlock}`);
  }

  if (collectionMap.size === 0) {
    console.log("Nothing to backfill.");
    return;
  }

  // Step 2 — for each collection, backfill all tokens (with checkpoint resume)
  console.log(`\nStep 2: backfilling tokens for each collection…`);
  const completed = loadCheckpoint(FROM_BLOCK);
  let totalScanned = 0;
  let totalUpserted = 0;
  let skipped = 0;

  for (const collection of collectionMap.values()) {
    const addr = collection.contractAddress.toLowerCase();
    if (completed.has(addr)) {
      console.log(`\n► ${addr} — already done (checkpoint), skipping`);
      skipped++;
      continue;
    }
    const scanFrom = getCollectionScanFromBlock(collection.registeredAtBlock, FROM_BLOCK);
    console.log(`\n► ${addr} (${collection.standard}) scanning from block ${scanFrom}`);
    try {
      const { scanned, upserted } = await backfillCollection(client, collection, scanFrom);
      totalScanned += scanned;
      totalUpserted += upserted;
      console.log(`  ✓ scanned=${scanned} upserted=${upserted}`);
      completed.add(addr);
      saveCheckpoint(FROM_BLOCK, completed);
    } catch (err) {
      console.error(`  ✗ failed:`, err instanceof Error ? err.message : err);
      // Don't add to completed — will retry on next run
    }
  }

  // Remove checkpoint on clean completion
  if (existsSync(CHECKPOINT_FILE)) {
    unlinkSync(CHECKPOINT_FILE);
    console.log("\n[checkpoint] cleared (run complete)");
  }

  // Final DB counts
  const [colCount, tokCount] = await Promise.all([
    prisma.collection.count(),
    (prisma.token as any).count()
  ]);

  console.log(`\n─────────────────────────────────────`);
  console.log(`Backfill complete`);
  console.log(`  Collections discovered : ${collectionMap.size}`);
  console.log(`  Collections skipped    : ${skipped}`);
  console.log(`  Tokens scanned         : ${totalScanned}`);
  console.log(`  Tokens upserted        : ${totalUpserted}`);
  console.log(`  DB collections total   : ${colCount}`);
  console.log(`  DB tokens total        : ${tokCount}`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Fatal:", err);
  await prisma.$disconnect();
  process.exit(1);
});
