import "dotenv/config";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { URL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { pino } from "pino";
import { createPublicClient, http } from "viem";
import { isAddress, isZeroAddress, normalizeSubname, parseBearerToken, getClientIp, isRateLimited } from "./utils.js";

const log = pino({ level: process.env.LOG_LEVEL || "info" });

type CreateReportPayload = {
  listingId: number;
  collectionAddress: string;
  tokenId: string;
  sellerAddress: string;
  standard?: string;
  reporterAddress: string;
  reason: string;
  evidence?: string;
};

type ResolveReportPayload = {
  action: "hide" | "restore" | "dismiss";
  actor: string;
  notes?: string;
};

type SetListingVisibilityPayload = {
  hidden: boolean;
  actor: string;
  notes?: string;
};

type BackfillSubnamePayload = {
  subname: string;
  ownerAddress?: string;
  contractAddress?: string;
};

type ModeratorPayload = {
  address: string;
  label?: string;
  enabled?: boolean;
};

type ModeratorRecord = {
  address: string;
  label: string | null;
  addedAt: string;
  updatedAt: string;
};

type ProfileLinkSource = "ens" | "external-subname" | "nftfactory-subname";

type ProfileLinkPayload = {
  name: string;
  source: ProfileLinkSource;
  ownerAddress: string;
  routeSlug?: string;
  collectionAddress?: string;
  tagline?: string;
  displayName?: string;
  bio?: string;
  bannerUrl?: string;
  avatarUrl?: string;
  featuredUrl?: string;
  accentColor?: string;
  links?: string[];
};

type ProfileTransferPayload = {
  slug: string;
  currentOwnerAddress: string;
  newOwnerAddress: string;
};

type ProfileRecord = {
  slug: string;
  fullName: string;
  source: ProfileLinkSource;
  ownerAddress: string;
  collectionAddress: string | null;
  tagline: string | null;
  displayName: string | null;
  bio: string | null;
  bannerUrl: string | null;
  avatarUrl: string | null;
  featuredUrl: string | null;
  accentColor: string | null;
  links: string[];
  createdAt: string;
  updatedAt: string;
};

type PaymentTokenLogPayload = {
  tokenAddress: string;
  sellerAddress: string;
  listingIds?: Array<number | string>;
};

type PaymentTokenRecord = {
  tokenAddress: string;
  firstSeenAt: string;
  lastSeenAt: string;
  firstSellerAddress: string;
  lastSellerAddress: string;
  useCount: number;
  status: "pending" | "approved" | "flagged";
  notes: string | null;
};

type PaymentTokenReviewPayload = {
  tokenAddress: string;
  status?: "pending" | "approved" | "flagged";
  notes?: string;
};

const CHAIN_ID = Number.parseInt(process.env.CHAIN_ID || "11155111", 10);
const PORT = Number.parseInt(process.env.INDEXER_PORT || "8787", 10);
const HOST = process.env.INDEXER_HOST || "127.0.0.1";
const ADMIN_TOKEN = process.env.INDEXER_ADMIN_TOKEN || "";
const TRUST_PROXY = process.env.TRUST_PROXY === "true";
const MODERATOR_REGISTRY_ADDRESS = process.env.MODERATOR_REGISTRY_ADDRESS || "";
const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS || process.env.NEXT_PUBLIC_REGISTRY_ADDRESS || "";
const MARKETPLACE_ADDRESS = process.env.MARKETPLACE_ADDRESS || process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS || "";
const MODERATOR_FILE = process.env.INDEXER_MODERATOR_FILE || path.join(process.cwd(), "data", "moderators.json");
const PROFILE_FILE = process.env.INDEXER_PROFILE_FILE || path.join(process.cwd(), "data", "profiles.json");
const PAYMENT_TOKEN_FILE = process.env.INDEXER_PAYMENT_TOKEN_FILE || path.join(process.cwd(), "data", "payment-tokens.json");
const ADMIN_ALLOWLIST = new Set(
  (process.env.INDEXER_ADMIN_ALLOWLIST || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);

function createFallbackPrisma(): PrismaClient {
  log.warn("Prisma client is unavailable in this worktree. Running indexer in degraded in-memory mode.");
  return {
    report: {
      findMany: async () => [],
      create: async () => ({}),
      findUnique: async () => null,
      update: async () => ({}),
      count: async () => 0
    },
    moderationAction: {
      findMany: async () => [],
      create: async () => ({})
    },
    listing: {
      findMany: async () => [],
      findUnique: async () => null,
      upsert: async () => ({}),
      count: async () => 0
    },
    collection: {
      findMany: async () => [],
      updateMany: async () => ({ count: 0 }),
      upsert: async () => ({}),
      count: async () => 0
    },
    token: {
      findMany: async () => [],
      upsert: async () => ({}),
      count: async () => 0
    }
  } as unknown as PrismaClient;
}

function createPrismaClient(): PrismaClient {
  try {
    return new PrismaClient();
  } catch (err) {
    if (err instanceof Error && err.message.includes("did not initialize yet")) {
      return createFallbackPrisma();
    }
    throw err;
  }
}

const prisma = createPrismaClient();
const RESOLVE_ACTIONS = new Set(["hide", "restore", "dismiss"]);
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

class BadRequestError extends Error {}
type RequestHandlerConfig = {
  chainId: number;
  rpcUrl: string;
  adminToken: string;
  adminAllowlist: Set<string>;
  trustProxy: boolean;
  marketplaceAddress: `0x${string}` | null;
  registryAddress: `0x${string}` | null;
  moderatorRegistryAddress: `0x${string}` | null;
};
type IndexerDeps = {
  prisma: PrismaClient;
  getClientIpImpl: typeof getClientIp;
  isRateLimitedImpl: typeof isRateLimited;
};

function assertEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

async function readModeratorRecords(): Promise<ModeratorRecord[]> {
  try {
    const raw = await readFile(MODERATOR_FILE, "utf8");
    const parsed = JSON.parse(raw) as ModeratorRecord[];
    return parsed
      .filter((item) => item && isAddress(String(item.address || "").toLowerCase()))
      .map((item) => ({
        address: item.address.toLowerCase(),
        label: item.label?.trim() || null,
        addedAt: item.addedAt || new Date().toISOString(),
        updatedAt: item.updatedAt || new Date().toISOString()
      }));
  } catch {
    return [];
  }
}

const moderatorRegistryAbi = [
  {
    type: "function",
    name: "moderatorCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "getModeratorAt",
    stateMutability: "view",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "account", type: "address" },
          { name: "label", type: "string" },
          { name: "active", type: "bool" }
        ]
      }
    ]
  }
] as const;

const registryReadAbi = [
  {
    type: "function",
    name: "creatorContracts",
    stateMutability: "view",
    inputs: [{ name: "creator", type: "address" }],
    outputs: [
      {
        type: "tuple[]",
        components: [
          { name: "owner", type: "address" },
          { name: "contractAddress", type: "address" },
          { name: "isNftFactoryCreated", type: "bool" },
          { name: "ensSubname", type: "string" },
          { name: "standard", type: "string" }
        ]
      }
    ]
  }
] as const;

const erc721TransferEvent = {
  type: "event",
  name: "Transfer",
  inputs: [
    { indexed: true, name: "from", type: "address" },
    { indexed: true, name: "to", type: "address" },
    { indexed: true, name: "tokenId", type: "uint256" }
  ]
} as const;

const erc721ReadAbi = [
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

const erc1155ReadAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" }
    ],
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

const marketplaceReadAbi = [
  {
    type: "function",
    name: "nextListingId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "listings",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "seller", type: "address" },
      { name: "nft", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "standard", type: "string" },
      { name: "paymentToken", type: "address" },
      { name: "price", type: "uint256" },
      { name: "expiresAt", type: "uint256" },
      { name: "active", type: "bool" }
    ]
  }
] as const;

const LISTING_SYNC_BATCH_SIZE = 20;
const LISTING_SYNC_TTL_MS = 30_000;
let lastListingSyncAt = 0;
let lastListingSyncCount = 0;
let listingSyncPromise: Promise<void> | null = null;

async function readOnchainModeratorRecords(config: RequestHandlerConfig): Promise<ModeratorRecord[]> {
  if (!config.moderatorRegistryAddress) return [];

  try {
    const client = createPublicClient({
      transport: http(config.rpcUrl)
    });

    const count = await client.readContract({
      address: config.moderatorRegistryAddress,
      abi: moderatorRegistryAbi,
      functionName: "moderatorCount"
    });

    const now = new Date().toISOString();
    const records: ModeratorRecord[] = [];

    for (let i = 0n; i < count; i++) {
      const entry = await client.readContract({
        address: config.moderatorRegistryAddress,
        abi: moderatorRegistryAbi,
        functionName: "getModeratorAt",
        args: [i]
      });

      const account = String(entry.account || "").toLowerCase();
      if (!isAddress(account) || !entry.active) continue;
      records.push({
        address: account,
        label: String(entry.label || "").trim() || "On-chain moderator",
        addedAt: now,
        updatedAt: now
      });
    }

    return records;
  } catch (err) {
    log.warn({ err, moderatorRegistry: config.moderatorRegistryAddress }, "Failed to read ModeratorRegistry");
    return [];
  }
}

async function readEffectiveModeratorRecords(config: RequestHandlerConfig): Promise<ModeratorRecord[]> {
  const local = await readModeratorRecords();
  const onchain = await readOnchainModeratorRecords(config);
  const merged = new Map<string, ModeratorRecord>();

  for (const item of local) merged.set(item.address, item);
  for (const item of onchain) merged.set(item.address, item);

  return Array.from(merged.values()).sort((a, b) => a.address.localeCompare(b.address));
}

async function writeModeratorRecords(records: ModeratorRecord[]): Promise<void> {
  await mkdir(path.dirname(MODERATOR_FILE), { recursive: true });
  await writeFile(MODERATOR_FILE, JSON.stringify(records, null, 2), "utf8");
}

async function readPaymentTokenRecords(): Promise<PaymentTokenRecord[]> {
  try {
    const raw = await readFile(PAYMENT_TOKEN_FILE, "utf8");
    const parsed = JSON.parse(raw) as PaymentTokenRecord[];
    return parsed
      .filter((item) => item && isAddress(String(item.tokenAddress || "").toLowerCase()))
      .map((item) => ({
        tokenAddress: item.tokenAddress.toLowerCase(),
        firstSeenAt: item.firstSeenAt || new Date().toISOString(),
        lastSeenAt: item.lastSeenAt || new Date().toISOString(),
        firstSellerAddress: isAddress(String(item.firstSellerAddress || "").toLowerCase())
          ? item.firstSellerAddress.toLowerCase()
          : "0x0000000000000000000000000000000000000000",
        lastSellerAddress: isAddress(String(item.lastSellerAddress || "").toLowerCase())
          ? item.lastSellerAddress.toLowerCase()
          : "0x0000000000000000000000000000000000000000",
        useCount: Number.isInteger(item.useCount) && item.useCount > 0 ? item.useCount : 1,
        status: item.status === "approved" || item.status === "flagged" ? item.status : "pending",
        notes: item.notes?.trim() || null
      }));
  } catch {
    return [];
  }
}

async function writePaymentTokenRecords(records: PaymentTokenRecord[]): Promise<void> {
  await mkdir(path.dirname(PAYMENT_TOKEN_FILE), { recursive: true });
  await writeFile(PAYMENT_TOKEN_FILE, JSON.stringify(records, null, 2), "utf8");
}

function normalizeProfileInput(name: string, source: ProfileLinkSource): { slug: string; fullName: string } | null {
  const raw = String(name || "").trim().toLowerCase();
  if (!raw) return null;

  if (source === "nftfactory-subname") {
    const slug = normalizeSubname(raw);
    if (!slug) return null;
    return {
      slug,
      fullName: `${slug}.nftfactory.eth`
    };
  }

  const fullName = raw.replace(/\.+/g, ".").replace(/^\./, "").replace(/\.$/, "");
  const labels = fullName.split(".").filter(Boolean);
  const valid = labels.length > 0 && labels.every((label) => Boolean(normalizeSubname(label)));
  if (!fullName || !valid) return null;
  const slug = labels.slice().reverse().join(".");

  return {
    slug,
    fullName
  };
}

function normalizeRouteSlug(value: string): string | null {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  const normalized = raw.replace(/\.+/g, ".").replace(/^\./, "").replace(/\.$/, "");
  if (!normalized) return null;
  const valid = normalized
    .split(".")
    .every((label) => Boolean(normalizeSubname(label)));
  return valid ? normalized : null;
}

function toProfileResponse(record: ProfileRecord): ProfileRecord {
  return {
    ...record,
    ownerAddress: record.ownerAddress.toLowerCase(),
    collectionAddress: record.collectionAddress?.toLowerCase() || null
  };
}

function sanitizeProfileText(value: string | undefined, max = 280): string | null {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function sanitizeProfileUrl(value: string | undefined): string | null {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed) || /^ipfs:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return null;
}

function sanitizeAccentColor(value: string | undefined): string | null {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  return /^#[a-fA-F0-9]{6}$/.test(trimmed) ? trimmed : null;
}

function sanitizeProfileLinks(value: string[] | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeProfileUrl(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, 8);
}

async function readProfileRecords(): Promise<ProfileRecord[]> {
  try {
    const raw = await readFile(PROFILE_FILE, "utf8");
    const parsed = JSON.parse(raw) as ProfileRecord[];
    return parsed
      .filter((item) => item && isAddress(String(item.ownerAddress || "").toLowerCase()))
      .map((item) => {
        const source = (item.source || "nftfactory-subname") as ProfileLinkSource;
        const normalized = normalizeProfileInput(String(item.fullName || item.slug || ""), source);
        if (!normalized) {
          return null;
        }
        const collectionAddress = String(item.collectionAddress || "").trim().toLowerCase();
        return {
          slug: normalized.slug,
          fullName: normalized.fullName,
          source,
          ownerAddress: item.ownerAddress.toLowerCase(),
          collectionAddress: collectionAddress && isAddress(collectionAddress) ? collectionAddress : null,
          tagline: sanitizeProfileText(item.tagline || undefined, 120),
          displayName: sanitizeProfileText(item.displayName || undefined, 80),
          bio: sanitizeProfileText(item.bio || undefined, 1200),
          bannerUrl: sanitizeProfileUrl(item.bannerUrl || undefined),
          avatarUrl: sanitizeProfileUrl(item.avatarUrl || undefined),
          featuredUrl: sanitizeProfileUrl(item.featuredUrl || undefined),
          accentColor: sanitizeAccentColor(item.accentColor || undefined),
          links: sanitizeProfileLinks(item.links),
          createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: item.updatedAt || new Date().toISOString()
        };
      })
      .filter((item: ProfileRecord | null): item is ProfileRecord => Boolean(item));
  } catch {
    return [];
  }
}

async function writeProfileRecords(records: ProfileRecord[]): Promise<void> {
  await mkdir(path.dirname(PROFILE_FILE), { recursive: true });
  await writeFile(PROFILE_FILE, JSON.stringify(records, null, 2), "utf8");
}

async function getEffectiveAdminAllowlist(
  config: RequestHandlerConfig,
  includeDynamicModerators: boolean
): Promise<Set<string>> {
  const allowlist = new Set(config.adminAllowlist);
  if (!includeDynamicModerators) return allowlist;
  const records = await readEffectiveModeratorRecords(config);
  for (const record of records) {
    allowlist.add(record.address);
  }
  return allowlist;
}

async function assertAdminRequest(
  req: IncomingMessage,
  config: RequestHandlerConfig,
  actor?: string,
  options?: { includeDynamicModerators?: boolean }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (config.adminToken) {
    const authToken = parseBearerToken(req.headers.authorization);
    if (!authToken || authToken !== config.adminToken) {
      return { ok: false, error: "Missing or invalid admin token" };
    }
  }

  const effectiveAllowlist = await getEffectiveAdminAllowlist(config, options?.includeDynamicModerators !== false);

  if (effectiveAllowlist.size > 0) {
    const headerActor = String(req.headers["x-admin-address"] || "").trim().toLowerCase();
    const payloadActor = String(actor || "").trim().toLowerCase();
    const candidate = headerActor || payloadActor;
    if (!candidate || !isAddress(candidate) || !effectiveAllowlist.has(candidate)) {
      return { ok: false, error: "Actor is not in admin allowlist" };
    }
  }

  return { ok: true };
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Address"
  });
  res.end(JSON.stringify(payload));
}

function parseListingId(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

function buildGatewayUrl(cidLike: string | null | undefined): string | null {
  const value = String(cidLike || "").trim();
  if (!value) return null;
  if (value.startsWith("ipfs://")) {
    return `https://gateway.pinata.cloud/ipfs/${value.replace(/^ipfs:\/\//, "")}`;
  }
  if (value.startsWith("pending://")) return null;
  return value;
}

function toTokenApiShape(item: any) {
  return {
    id: item.id,
    tokenId: item.tokenId,
    creatorAddress: item.creatorAddress,
    ownerAddress: item.ownerAddress,
    mintTxHash: item.mintTxHash || null,
    metadataCid: item.metadataCid,
    metadataUrl: buildGatewayUrl(item.metadataCid),
    mediaCid: item.mediaCid,
    mediaUrl: buildGatewayUrl(item.mediaCid),
    immutable: item.immutable,
    mintedAt: item.mintedAt,
    activeListing: item.listings?.[0]
      ? {
          listingId: item.listings[0].listingId,
          sellerAddress: item.listings[0].sellerAddress,
          paymentToken: item.listings[0].paymentToken,
          priceRaw: item.listings[0].priceRaw,
          active: item.listings[0].active,
          createdAt: item.listings[0].createdAt,
          updatedAt: item.listings[0].updatedAt
        }
      : null
  };
}

function toListingApiShape(item: any) {
  const token = item.token || null;
  const collection = token?.collection || null;

  return {
    id: Number.parseInt(item.listingId, 10) || 0,
    listingId: item.listingId,
    sellerAddress: item.sellerAddress,
    collectionAddress: item.collectionAddress,
    tokenId: item.tokenId,
    amountRaw: "1",
    standard: collection?.standard || "UNKNOWN",
    paymentToken: item.paymentToken,
    priceRaw: item.priceRaw,
    expiresAtRaw: "0",
    active: item.active,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    token: token
      ? {
          id: token.id,
          creatorAddress: token.creatorAddress,
          ownerAddress: token.ownerAddress,
          mintTxHash: token.mintTxHash || null,
          metadataCid: token.metadataCid,
          metadataUrl: buildGatewayUrl(token.metadataCid),
          mediaCid: token.mediaCid,
          mediaUrl: buildGatewayUrl(token.mediaCid),
          immutable: token.immutable,
          mintedAt: token.mintedAt,
          collection: collection
            ? {
                chainId: collection.chainId,
                contractAddress: collection.contractAddress,
                ownerAddress: collection.ownerAddress,
                ensSubname: collection.ensSubname,
                standard: collection.standard,
                isFactoryCreated: collection.isFactoryCreated,
                isUpgradeable: collection.isUpgradeable,
                finalizedAt: collection.finalizedAt,
                createdAt: collection.createdAt,
                updatedAt: collection.updatedAt
              }
            : null
        }
      : null
  };
}

let mintTxHashColumnAvailableCache: boolean | null = null;

async function hasMintTxHashColumn(deps: IndexerDeps): Promise<boolean> {
  if (mintTxHashColumnAvailableCache !== null) {
    return mintTxHashColumnAvailableCache;
  }

  const prismaAny = deps.prisma as any;
  if (typeof prismaAny.$queryRawUnsafe !== "function") {
    mintTxHashColumnAvailableCache = false;
    return false;
  }

  try {
    const rows = (await prismaAny.$queryRawUnsafe(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Token'
        AND column_name = 'mintTxHash'
      LIMIT 1
    `)) as Array<unknown>;
    mintTxHashColumnAvailableCache = rows.length > 0;
    return mintTxHashColumnAvailableCache;
  } catch {
    mintTxHashColumnAvailableCache = false;
    return false;
  }
}

async function attachMintTxHashes(
  items: Array<{
    id?: string;
    tokenId: string;
    mintTxHash?: string | null;
    collection?: { contractAddress: string; standard: string } | null;
  }>,
  config: RequestHandlerConfig,
  deps?: IndexerDeps
): Promise<void> {
  const pending = items.filter(
    (item) =>
      !item.mintTxHash &&
      item.collection &&
      isAddress(String(item.collection.contractAddress || "").toLowerCase()) &&
      item.tokenId
  );
  if (pending.length === 0) return;

  const client = createPublicClient({
    transport: http(config.rpcUrl)
  });

  const groups = new Map<string, typeof pending>();
  for (const item of pending) {
    const contractAddress = String(item.collection?.contractAddress || "").toLowerCase();
    const standard = String(item.collection?.standard || "ERC721").toUpperCase();
    const key = `${contractAddress}:${standard}`;
    const next = groups.get(key) || [];
    next.push(item);
    groups.set(key, next);
  }

  await Promise.all(
    [...groups.entries()].map(async ([key, group]) => {
      const [contractAddress, standard] = key.split(":");
      try {
        if (standard === "ERC1155") {
          const tokenTxs = new Map<string, string>();
          const singleLogs = await client.getLogs({
            address: contractAddress as `0x${string}`,
            event: erc1155TransferSingleEvent,
            fromBlock: 0n,
            toBlock: "latest"
          });
          const batchLogs = await client.getLogs({
            address: contractAddress as `0x${string}`,
            event: erc1155TransferBatchEvent,
            fromBlock: 0n,
            toBlock: "latest"
          });

          for (const log of singleLogs) {
            if (String(log.args.from || "").toLowerCase() !== ZERO_ADDRESS) continue;
            const tokenId = log.args.id?.toString();
            if (tokenId && !tokenTxs.has(tokenId)) {
              tokenTxs.set(tokenId, log.transactionHash);
            }
          }

          for (const log of batchLogs) {
            if (String(log.args.from || "").toLowerCase() !== ZERO_ADDRESS) continue;
            for (const id of log.args.ids || []) {
              const tokenId = id.toString();
              if (!tokenTxs.has(tokenId)) {
                tokenTxs.set(tokenId, log.transactionHash);
              }
            }
          }

          for (const item of group) {
            item.mintTxHash = tokenTxs.get(item.tokenId) || null;
          }
          if (deps) {
            await Promise.all(
              group
                .filter((item) => item.id && item.mintTxHash)
                .map((item) =>
                  (deps.prisma.token as any).update({
                    where: { id: item.id },
                    data: { mintTxHash: item.mintTxHash }
                  }).catch(() => null)
                )
            );
          }
          return;
        }

        const tokenTxs = new Map<string, string>();
        const logs = await client.getLogs({
          address: contractAddress as `0x${string}`,
          event: erc721TransferEvent,
          fromBlock: 0n,
          toBlock: "latest"
        });
        for (const log of logs) {
          if (String(log.args.from || "").toLowerCase() !== ZERO_ADDRESS) continue;
          const tokenId = log.args.tokenId?.toString();
          if (tokenId && !tokenTxs.has(tokenId)) {
            tokenTxs.set(tokenId, log.transactionHash);
          }
        }
        for (const item of group) {
          item.mintTxHash = tokenTxs.get(item.tokenId) || null;
        }
        if (deps) {
          await Promise.all(
            group
              .filter((item) => item.id && item.mintTxHash)
              .map((item) =>
                (deps.prisma.token as any).update({
                  where: { id: item.id },
                  data: { mintTxHash: item.mintTxHash }
                }).catch(() => null)
              )
          );
        }
      } catch {
        for (const item of group) {
          item.mintTxHash = item.mintTxHash || null;
        }
      }
    })
  );
}

async function findTokenRefIdForListing(
  collectionAddress: string,
  tokenId: string,
  deps: IndexerDeps
): Promise<string | null> {
  const token = await (deps.prisma.token as any).findFirst({
    where: {
      tokenId,
      collection: {
        contractAddress: collectionAddress
      }
    },
    select: {
      id: true
    }
  });
  return token?.id || null;
}

async function syncMarketplaceListingsIfStale(
  deps: IndexerDeps,
  config: RequestHandlerConfig,
  options?: { force?: boolean }
): Promise<void> {
  if (!config.marketplaceAddress) return;

  const now = Date.now();
  if (listingSyncPromise) {
    await listingSyncPromise;
    return;
  }
  if (!options?.force && now - lastListingSyncAt < LISTING_SYNC_TTL_MS) {
    return;
  }

  listingSyncPromise = (async () => {
    try {
      const client = createPublicClient({
        transport: http(config.rpcUrl)
      });

      const nextListingId = (await client.readContract({
        address: config.marketplaceAddress as `0x${string}`,
        abi: marketplaceReadAbi,
        functionName: "nextListingId"
      })) as bigint;

      const activeListingIds = new Set<string>();
      const currentUnix = BigInt(Math.floor(Date.now() / 1000));

      for (let offset = 0; offset < Number(nextListingId); offset += LISTING_SYNC_BATCH_SIZE) {
        const batchIds: number[] = [];
        for (
          let id = offset;
          id < Math.min(Number(nextListingId), offset + LISTING_SYNC_BATCH_SIZE);
          id += 1
        ) {
          batchIds.push(id);
        }

        const rows = (await Promise.all(
          batchIds.map((id) =>
            client.readContract({
              address: config.marketplaceAddress as `0x${string}`,
              abi: marketplaceReadAbi,
              functionName: "listings",
              args: [BigInt(id)]
            })
          )
        )) as readonly (readonly [`0x${string}`, `0x${string}`, bigint, bigint, string, `0x${string}`, bigint, bigint, boolean])[];

        await Promise.all(
          rows.map(async (row, index) => {
            const listingId = String(batchIds[index]);
            const isActive = row[8] && row[7] > currentUnix;
            if (!isActive) return;

            activeListingIds.add(listingId);
            const collectionAddress = row[1].toLowerCase();
            const tokenId = row[2].toString();
            const tokenRefId = await findTokenRefIdForListing(collectionAddress, tokenId, deps);

            await deps.prisma.listing.upsert({
              where: { listingId },
              update: {
                chainId: config.chainId,
                collectionAddress,
                tokenId,
                sellerAddress: row[0].toLowerCase(),
                paymentToken: row[5].toLowerCase(),
                priceRaw: row[6].toString(),
                active: true,
                tokenRefId
              },
              create: {
                listingId,
                chainId: config.chainId,
                collectionAddress,
                tokenId,
                sellerAddress: row[0].toLowerCase(),
                paymentToken: row[5].toLowerCase(),
                priceRaw: row[6].toString(),
                active: true,
                tokenRefId
              }
            });
          })
        );
      }

      await deps.prisma.listing.updateMany({
        where: {
          chainId: config.chainId,
          active: true,
          ...(activeListingIds.size > 0 ? { listingId: { notIn: Array.from(activeListingIds) } } : {})
        },
        data: {
          active: false
        }
      });

      lastListingSyncAt = Date.now();
      lastListingSyncCount = activeListingIds.size;
    } catch (err) {
      log.warn({ err }, "marketplace_listing_sync_failed");
    } finally {
      listingSyncPromise = null;
    }
  })();

  await listingSyncPromise;
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) throw new BadRequestError("Missing JSON body");
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new BadRequestError("Invalid JSON body");
  }
}

async function ensureTokenForListing(
  payload: CreateReportPayload,
  deps: IndexerDeps,
  config: RequestHandlerConfig
): Promise<{ tokenRefId: string; listingRowId: string }> {
  const collectionAddress = payload.collectionAddress.toLowerCase();
  const sellerAddress = payload.sellerAddress.toLowerCase();
  const standard = (payload.standard || "UNKNOWN").toUpperCase();

  const collection = await deps.prisma.collection.upsert({
    where: { contractAddress: collectionAddress },
    update: {
      ownerAddress: sellerAddress,
      standard
    },
    create: {
      chainId: config.chainId,
      contractAddress: collectionAddress,
      ownerAddress: sellerAddress,
      standard,
      isFactoryCreated: true,
      isUpgradeable: true
    }
  });

  const token = await deps.prisma.token.upsert({
    where: {
      collectionId_tokenId: {
        collectionId: collection.id,
        tokenId: payload.tokenId
      }
    },
    update: {
      ownerAddress: sellerAddress
    },
    create: {
      collectionId: collection.id,
      tokenId: payload.tokenId,
      creatorAddress: sellerAddress,
      ownerAddress: sellerAddress,
      metadataCid: `pending://${collectionAddress}/${payload.tokenId}`,
      immutable: true
    }
  });

  const listing = await deps.prisma.listing.upsert({
    where: { listingId: String(payload.listingId) },
    update: {
      chainId: config.chainId,
      collectionAddress,
      tokenId: payload.tokenId,
      sellerAddress,
      paymentToken: "0x0000000000000000000000000000000000000000",
      priceRaw: "0",
      tokenRefId: token.id
    },
    create: {
      listingId: String(payload.listingId),
      chainId: config.chainId,
      collectionAddress,
      tokenId: payload.tokenId,
      sellerAddress,
      paymentToken: "0x0000000000000000000000000000000000000000",
      priceRaw: "0",
      tokenRefId: token.id
    }
  });

  return { tokenRefId: token.id, listingRowId: listing.id };
}

async function listHiddenListingIds(deps: IndexerDeps): Promise<number[]> {
  const actions = await deps.prisma.moderationAction.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      tokenId: true,
      action: true
    }
  });

  const hiddenByToken = new Map<string, boolean>();
  for (const action of actions) {
    if (hiddenByToken.has(action.tokenId)) continue;
    const normalizedAction = action.action.toLowerCase();
    if (normalizedAction === "hide") {
      hiddenByToken.set(action.tokenId, true);
      continue;
    }
    if (normalizedAction === "restore") {
      hiddenByToken.set(action.tokenId, false);
    }
  }

  const hiddenTokenIds = Array.from(hiddenByToken.entries())
    .filter(([, hidden]) => hidden)
    .map(([tokenId]) => tokenId);

  if (hiddenTokenIds.length === 0) return [];

  const listings = await deps.prisma.listing.findMany({
    where: {
      tokenRefId: { in: hiddenTokenIds },
      active: true
    },
    select: { listingId: true }
  });

  return listings
    .map((item: { listingId: string }) => Number.parseInt(item.listingId, 10))
    .filter((id: number) => Number.isInteger(id) && id >= 0)
    .sort((a: number, b: number) => a - b);
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: IndexerDeps,
  config: RequestHandlerConfig
): Promise<void> {
  if (!req.url || !req.method) {
    sendJson(res, 400, { error: "Invalid request" });
    return;
  }

  if (req.method === "OPTIONS") {
    sendJson(res, 200, { ok: true });
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const path = url.pathname;

  if (req.method === "GET" && path === "/health") {
    const mintTxHashColumnAvailable = await hasMintTxHashColumn(deps);
    sendJson(res, 200, {
      ok: true,
      service: "indexer-api",
      schema: {
        mintTxHashColumnAvailable
      },
      marketplace: {
        configured: Boolean(config.marketplaceAddress),
        syncInProgress: Boolean(listingSyncPromise),
        lastListingSyncAt: lastListingSyncAt > 0 ? new Date(lastListingSyncAt).toISOString() : null,
        lastListingSyncCount
      }
    });
    return;
  }

  if (req.method === "GET" && path === "/api/moderation/reports") {
    const status = (url.searchParams.get("status") || "").toLowerCase();
    if (status && status !== "open" && status !== "resolved") {
      sendJson(res, 400, { error: "Invalid status query. Expected 'open' or 'resolved'" });
      return;
    }
    const reports = await deps.prisma.report.findMany({
      where: status ? { status } : undefined,
      include: {
        token: {
          include: {
            listings: {
              take: 1,
              orderBy: { createdAt: "desc" }
            }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    sendJson(
      res,
      200,
      reports.map((report: any) => ({
        id: report.id,
        listingId: parseListingId(report.token.listings[0]?.listingId),
        reason: report.reason,
        reporterAddress: report.reporterAddress,
        status: report.status,
        evidence: report.evidence,
        createdAt: report.createdAt.toISOString(),
        updatedAt: report.updatedAt.toISOString()
      }))
    );
    return;
  }

  if (req.method === "POST" && path === "/api/moderation/reports") {
    const payload = await readJsonBody<CreateReportPayload>(req);
    if (
      !Number.isInteger(payload.listingId) ||
      payload.listingId < 0 ||
      !isAddress(payload.collectionAddress) ||
      !isAddress(payload.sellerAddress) ||
      !isAddress(payload.reporterAddress) ||
      isZeroAddress(payload.reporterAddress) ||
      !payload.tokenId?.trim() ||
      !payload.reason?.trim()
    ) {
      sendJson(res, 400, { error: "Invalid report payload" });
      return;
    }

    const { tokenRefId } = await ensureTokenForListing(payload, deps, config);
    const report = await deps.prisma.report.create({
      data: {
        tokenId: tokenRefId,
        reporterAddress: payload.reporterAddress.toLowerCase(),
        reason: payload.reason.trim().toLowerCase(),
        evidence: payload.evidence?.trim() || null,
        status: "open"
      }
    });

    sendJson(res, 201, {
      id: report.id,
      status: report.status,
      createdAt: report.createdAt.toISOString()
    });
    return;
  }

  if (req.method === "POST" && /^\/api\/moderation\/reports\/[^/]+\/resolve$/.test(path)) {
    if (deps.isRateLimitedImpl(deps.getClientIpImpl(req, config.trustProxy))) {
      sendJson(res, 429, { error: "Too many requests" });
      return;
    }
    const reportId = path.split("/")[4];
    const payload = await readJsonBody<ResolveReportPayload>(req);

    if (!payload.action || !RESOLVE_ACTIONS.has(payload.action) || !payload.actor?.trim()) {
      sendJson(res, 400, { error: "Invalid resolve payload" });
      return;
    }
    const auth = await assertAdminRequest(req, config, payload.actor);
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return;
    }

    const report = await deps.prisma.report.findUnique({
      where: { id: reportId }
    });
    if (!report) {
      sendJson(res, 404, { error: "Report not found" });
      return;
    }

    await deps.prisma.report.update({
      where: { id: reportId },
      data: { status: "resolved" }
    });

    await deps.prisma.moderationAction.create({
      data: {
        tokenId: report.tokenId,
        reportId: report.id,
        action: payload.action.toLowerCase(),
        actor: payload.actor.trim().toLowerCase(),
        notes: payload.notes?.trim() || null
      }
    });

    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && path === "/api/moderation/actions") {
    const actions = await deps.prisma.moderationAction.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        token: {
          include: {
            listings: {
              take: 1,
              orderBy: { createdAt: "desc" }
            }
          }
        }
      }
    });

    sendJson(
      res,
      200,
      actions.map((action: any) => ({
        id: action.id,
        action: action.action,
        actor: action.actor,
        notes: action.notes,
        reportId: action.reportId,
        listingId: parseListingId(action.token.listings[0]?.listingId),
        createdAt: action.createdAt.toISOString()
      }))
    );
    return;
  }

  if (req.method === "GET" && path === "/api/moderation/hidden-listings") {
    const listingIds = await listHiddenListingIds(deps);
    sendJson(res, 200, { listingIds });
    return;
  }

  if (req.method === "POST" && /^\/api\/moderation\/listings\/[^/]+\/visibility$/.test(path)) {
    if (deps.isRateLimitedImpl(deps.getClientIpImpl(req, config.trustProxy))) {
      sendJson(res, 429, { error: "Too many requests" });
      return;
    }
    const listingId = path.split("/")[4];
    const payload = await readJsonBody<SetListingVisibilityPayload>(req);
    if (typeof payload.hidden !== "boolean" || !payload.actor?.trim()) {
      sendJson(res, 400, { error: "Invalid visibility payload" });
      return;
    }
    const auth = await assertAdminRequest(req, config, payload.actor);
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return;
    }
    const listing = await deps.prisma.listing.findUnique({
      where: { listingId },
      select: { tokenRefId: true }
    });

    if (!listing?.tokenRefId) {
      sendJson(res, 404, { error: "Listing not found in indexer DB" });
      return;
    }

    await deps.prisma.moderationAction.create({
      data: {
        tokenId: listing.tokenRefId,
        action: payload.hidden ? "hide" : "restore",
        actor: payload.actor?.trim().toLowerCase() || "admin",
        notes: payload.notes?.trim() || null
      }
    });

    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && path === "/api/admin/moderators") {
    if (deps.isRateLimitedImpl(deps.getClientIpImpl(req, config.trustProxy))) {
      sendJson(res, 429, { error: "Too many requests" });
      return;
    }
    const auth = await assertAdminRequest(req, config, undefined, { includeDynamicModerators: false });
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return;
    }

    const moderators = await readEffectiveModeratorRecords(config);
    sendJson(res, 200, {
      moderators,
      source: config.moderatorRegistryAddress ? "onchain+local" : "local",
      moderatorRegistryAddress: config.moderatorRegistryAddress
    });
    return;
  }

  if (req.method === "POST" && path === "/api/payment-tokens/log") {
    if (deps.isRateLimitedImpl(deps.getClientIpImpl(req, config.trustProxy))) {
      sendJson(res, 429, { error: "Too many requests" });
      return;
    }

    const payload = await readJsonBody<PaymentTokenLogPayload>(req);
    const tokenAddress = String(payload.tokenAddress || "").trim().toLowerCase();
    const sellerAddress = String(payload.sellerAddress || "").trim().toLowerCase();
    if (!isAddress(tokenAddress)) {
      sendJson(res, 400, { error: "Invalid tokenAddress" });
      return;
    }
    if (!isAddress(sellerAddress)) {
      sendJson(res, 400, { error: "Invalid sellerAddress" });
      return;
    }
    if (isZeroAddress(tokenAddress)) {
      sendJson(res, 400, { error: "Use ETH listings do not need token logging" });
      return;
    }

    const now = new Date().toISOString();
    const current = await readPaymentTokenRecords();
    const existing = current.find((item) => item.tokenAddress === tokenAddress);
    const next = current.filter((item) => item.tokenAddress !== tokenAddress);
    next.push({
      tokenAddress,
      firstSeenAt: existing?.firstSeenAt || now,
      lastSeenAt: now,
      firstSellerAddress: existing?.firstSellerAddress || sellerAddress,
      lastSellerAddress: sellerAddress,
      useCount: (existing?.useCount || 0) + 1,
      status: existing?.status || "pending",
      notes: existing?.notes || null
    });
    next.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
    await writePaymentTokenRecords(next);
    sendJson(res, 200, { ok: true, tokens: next });
    return;
  }

  if (req.method === "POST" && path === "/api/admin/moderators") {
    if (deps.isRateLimitedImpl(deps.getClientIpImpl(req, config.trustProxy))) {
      sendJson(res, 429, { error: "Too many requests" });
      return;
    }
    const payload = await readJsonBody<ModeratorPayload>(req);
    const auth = await assertAdminRequest(req, config, payload.address, { includeDynamicModerators: false });
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return;
    }
    if (config.moderatorRegistryAddress) {
      sendJson(res, 400, {
        error: "ModeratorRegistry is configured. Update moderators on-chain through the registry contract.",
        moderatorRegistryAddress: config.moderatorRegistryAddress
      });
      return;
    }

    const candidate = String(payload.address || "").trim().toLowerCase();
    if (!isAddress(candidate)) {
      sendJson(res, 400, { error: "Invalid moderator address" });
      return;
    }

    const now = new Date().toISOString();
    const current = await readModeratorRecords();
    const next = current.filter((item) => item.address !== candidate);
    if (payload.enabled !== false) {
      const existing = current.find((item) => item.address === candidate);
      next.push({
        address: candidate,
        label: payload.label?.trim() || existing?.label || null,
        addedAt: existing?.addedAt || now,
        updatedAt: now
      });
    }
    next.sort((a, b) => a.address.localeCompare(b.address));
    await writeModeratorRecords(next);

    sendJson(res, 200, { ok: true, moderators: next });
    return;
  }

  if (req.method === "GET" && path === "/api/admin/payment-tokens") {
    if (deps.isRateLimitedImpl(deps.getClientIpImpl(req, config.trustProxy))) {
      sendJson(res, 429, { error: "Too many requests" });
      return;
    }
    const auth = await assertAdminRequest(req, config, undefined, { includeDynamicModerators: false });
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return;
    }
    const tokens = await readPaymentTokenRecords();
    sendJson(res, 200, { tokens });
    return;
  }

  if (req.method === "POST" && path === "/api/admin/payment-tokens") {
    if (deps.isRateLimitedImpl(deps.getClientIpImpl(req, config.trustProxy))) {
      sendJson(res, 429, { error: "Too many requests" });
      return;
    }
    const payload = await readJsonBody<PaymentTokenReviewPayload>(req);
    const auth = await assertAdminRequest(req, config, undefined, { includeDynamicModerators: false });
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return;
    }
    const tokenAddress = String(payload.tokenAddress || "").trim().toLowerCase();
    if (!isAddress(tokenAddress) || isZeroAddress(tokenAddress)) {
      sendJson(res, 400, { error: "Invalid tokenAddress" });
      return;
    }
    const current = await readPaymentTokenRecords();
    const existing = current.find((item) => item.tokenAddress === tokenAddress);
    if (!existing) {
      sendJson(res, 404, { error: "Tracked token not found" });
      return;
    }
    const next = current
      .filter((item) => item.tokenAddress !== tokenAddress)
      .concat({
        ...existing,
        status: payload.status === "approved" || payload.status === "flagged" ? payload.status : "pending",
        notes: payload.notes?.trim() || null,
        lastSeenAt: existing.lastSeenAt
      })
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
    await writePaymentTokenRecords(next);
    sendJson(res, 200, { ok: true, tokens: next });
    return;
  }

  if (req.method === "POST" && path === "/api/admin/collections/backfill-subname") {
    if (deps.isRateLimitedImpl(deps.getClientIpImpl(req, config.trustProxy))) {
      sendJson(res, 429, { error: "Too many requests" });
      return;
    }
    const payload = await readJsonBody<BackfillSubnamePayload>(req);
    const auth = await assertAdminRequest(req, config);
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return;
    }

    const subname = normalizeSubname(payload.subname || "");
    if (!subname) {
      sendJson(res, 400, { error: "Invalid subname" });
      return;
    }

    const ownerAddress = payload.ownerAddress?.toLowerCase();
    const contractAddress = payload.contractAddress?.toLowerCase();
    if (!ownerAddress && !contractAddress) {
      sendJson(res, 400, { error: "Provide ownerAddress or contractAddress" });
      return;
    }
    if (ownerAddress && !isAddress(ownerAddress)) {
      sendJson(res, 400, { error: "Invalid ownerAddress" });
      return;
    }
    if (contractAddress && !isAddress(contractAddress)) {
      sendJson(res, 400, { error: "Invalid contractAddress" });
      return;
    }

    const result = await deps.prisma.collection.updateMany({
      where: {
        ...(ownerAddress ? { ownerAddress } : {}),
        ...(contractAddress ? { contractAddress } : {})
      },
      data: { ensSubname: subname }
    });

    sendJson(res, 200, {
      ok: true,
      updatedCount: result.count,
      subname
    });
    return;
  }

  if (req.method === "POST" && path === "/api/admin/tokens/backfill-mint-tx") {
    if (deps.isRateLimitedImpl(deps.getClientIpImpl(req, config.trustProxy))) {
      sendJson(res, 429, { error: "Too many requests" });
      return;
    }
    const auth = await assertAdminRequest(req, config, undefined, { includeDynamicModerators: false });
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return;
    }

    const includeMintTxHash = await hasMintTxHashColumn(deps);
    if (!includeMintTxHash) {
      sendJson(res, 409, {
        error: "mintTxHash column is not available yet",
        schema: { mintTxHashColumnAvailable: false }
      });
      return;
    }

    const limitRaw = Number.parseInt(String(url.searchParams.get("limit") || "200"), 10);
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 200;
    const candidates = await (deps.prisma.token as any).findMany({
      where: {
        mintTxHash: null
      },
      take: limit,
      orderBy: [{ mintedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        tokenId: true,
        collection: {
          select: {
            contractAddress: true,
            standard: true
          }
        }
      }
    });

    const rows = candidates.map((item: any) => ({
      id: item.id,
      tokenId: item.tokenId,
      mintTxHash: null,
      collection: {
        contractAddress: item.collection.contractAddress,
        standard: item.collection.standard
      }
    }));

    await attachMintTxHashes(rows, config, deps);

    sendJson(res, 200, {
      ok: true,
      scanned: candidates.length,
      resolved: rows.filter((item: any) => Boolean(item.mintTxHash)).length,
      unresolved: rows.filter((item: any) => !item.mintTxHash).length,
      limit
    });
    return;
  }

  if (req.method === "GET" && path === "/api/profiles") {
    const owner = String(url.searchParams.get("owner") || "").trim().toLowerCase();
    if (!owner || !isAddress(owner)) {
      sendJson(res, 400, { error: "Valid owner query param is required" });
      return;
    }

    const linkedProfiles = (await readProfileRecords())
      .filter((item) => item.ownerAddress === owner)
      .map(toProfileResponse);

    const collections = await deps.prisma.collection.findMany({
      where: { ownerAddress: owner },
      select: { ownerAddress: true, ensSubname: true, contractAddress: true },
      orderBy: { createdAt: "desc" }
    });

    const derivedProfiles = collections
      .map((item: any) => {
        const sourceName = String(item.ensSubname || "").trim();
        if (!sourceName) return null;
        const normalized = normalizeProfileInput(sourceName, "nftfactory-subname");
        if (!normalized) return null;
        return {
          slug: normalized.slug,
          fullName: normalized.fullName,
          source: "nftfactory-subname" as const,
          ownerAddress: item.ownerAddress.toLowerCase(),
          collectionAddress: item.contractAddress.toLowerCase(),
          tagline: null,
          displayName: null,
          bio: null,
          bannerUrl: null,
          avatarUrl: null,
          featuredUrl: null,
          accentColor: null,
          links: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      })
      .filter((item: ProfileRecord | null): item is ProfileRecord => Boolean(item));

    const merged = new Map<string, ProfileRecord>();
    const allProfiles = [...linkedProfiles, ...derivedProfiles].filter(
      (item): item is ProfileRecord => Boolean(item)
    );
    for (const item of allProfiles) {
      const key = `${item.slug}:${item.ownerAddress}:${item.collectionAddress || ""}:${item.source}`;
      if (!merged.has(key)) merged.set(key, item);
    }

    sendJson(res, 200, {
      ownerAddress: owner,
      profiles: Array.from(merged.values()).sort((a, b) => a.fullName.localeCompare(b.fullName))
    });
    return;
  }

  if (req.method === "POST" && path === "/api/admin/listings/sync") {
    if (deps.isRateLimitedImpl(deps.getClientIpImpl(req, config.trustProxy))) {
      sendJson(res, 429, { error: "Too many requests" });
      return;
    }
    const auth = await assertAdminRequest(req, config, undefined, { includeDynamicModerators: false });
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return;
    }
    if (!config.marketplaceAddress) {
      sendJson(res, 409, { error: "Marketplace sync is not configured" });
      return;
    }

    await syncMarketplaceListingsIfStale(deps, config, { force: true });
    sendJson(res, 200, {
      ok: true,
      configured: true,
      syncInProgress: Boolean(listingSyncPromise),
      lastListingSyncAt: lastListingSyncAt > 0 ? new Date(lastListingSyncAt).toISOString() : null,
      lastListingSyncCount
    });
    return;
  }

  if (req.method === "GET" && /^\/api\/owners\/[^/]+\/summary$/.test(path)) {
    const owner = String(decodeURIComponent(path.split("/")[3] || "")).trim().toLowerCase();
    if (!owner || !isAddress(owner)) {
      sendJson(res, 400, { error: "Valid owner address is required" });
      return;
    }
    await syncMarketplaceListingsIfStale(deps, config);
    const includeMintTxHash = await hasMintTxHashColumn(deps);

    const [linkedProfiles, collections, ownedTokenCount, createdTokenCount, activeListings, recentOwnedTokens] = await Promise.all([
      readProfileRecords().then((records) => records.filter((item) => item.ownerAddress === owner).map(toProfileResponse)),
      deps.prisma.collection.findMany({
        where: { ownerAddress: owner },
        orderBy: { createdAt: "desc" },
        select: {
          chainId: true,
          contractAddress: true,
          ownerAddress: true,
          ensSubname: true,
          standard: true,
          isFactoryCreated: true,
          isUpgradeable: true,
          finalizedAt: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              tokens: true
            }
          }
        }
      }),
      deps.prisma.token.count({ where: { ownerAddress: owner } }),
      deps.prisma.token.count({ where: { creatorAddress: owner } }),
      deps.prisma.listing.count({ where: { sellerAddress: owner, active: true } }),
      (deps.prisma.token as any).findMany({
        where: { ownerAddress: owner },
        take: 5,
        orderBy: [{ mintedAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          tokenId: true,
          ...(includeMintTxHash ? { mintTxHash: true } : {}),
          metadataCid: true,
          mediaCid: true,
          mintedAt: true,
          collection: {
            select: {
              contractAddress: true,
              ensSubname: true,
              standard: true,
              isFactoryCreated: true
            }
          }
        }
      })
    ]);

    const onchainClient = createPublicClient({
      transport: http(config.rpcUrl)
    });

    const factoryCollectionIds = collections
      .filter((item: any) => item.isFactoryCreated)
      .map((item: any) => item.id);
    const factoryCollectionTokens = factoryCollectionIds.length
      ? await (deps.prisma.token as any).findMany({
          where: {
            collectionId: { in: factoryCollectionIds }
          },
          orderBy: [{ mintedAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            tokenId: true,
            creatorAddress: true,
            ownerAddress: true,
            ...(includeMintTxHash ? { mintTxHash: true } : {}),
            metadataCid: true,
            mediaCid: true,
            immutable: true,
            mintedAt: true,
            collectionId: true,
            listings: {
              where: { active: true },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                listingId: true,
                sellerAddress: true,
                paymentToken: true,
                priceRaw: true,
                active: true,
                createdAt: true,
                updatedAt: true
              }
            }
          }
        })
      : [];
    const tokensByCollectionId = new Map<string, any[]>();
    for (const token of factoryCollectionTokens as Array<any>) {
      const next = tokensByCollectionId.get(token.collectionId) || [];
      next.push(token);
      tokensByCollectionId.set(token.collectionId, next);
    }

    const dbFactoryByAddress = new Map<string, any>(
      collections
        .filter((item: any) => item.isFactoryCreated)
        .map((item: any) => [String(item.contractAddress).toLowerCase(), item])
    );

    const hydratedFactoryCollections: Array<{
      chainId: number;
      contractAddress: string;
      ownerAddress: string;
      ensSubname: string | null;
      standard: string;
      isFactoryCreated: boolean;
      isUpgradeable: boolean;
      finalizedAt: string | null;
      createdAt: string;
      updatedAt: string;
      tokenCount: number;
      tokens: ReturnType<typeof toTokenApiShape>[];
    }> = [];

    try {
      if (!config.registryAddress) {
        throw new Error("Registry address not configured");
      }
      const chainRecords = (await onchainClient.readContract({
        address: config.registryAddress,
        abi: registryReadAbi,
        functionName: "creatorContracts",
        args: [owner as `0x${string}`]
      })) as Array<{
        owner: string;
        contractAddress: string;
        isNftFactoryCreated: boolean;
        ensSubname: string;
        standard: string;
      }>;

      for (const record of chainRecords) {
        if (!record.isNftFactoryCreated) continue;
        const contractAddress = String(record.contractAddress || "").toLowerCase();
        if (!isAddress(contractAddress)) continue;

        const existing = dbFactoryByAddress.get(contractAddress);
        const existingTokens = existing ? (tokensByCollectionId.get(existing.id) || []).map(toTokenApiShape) : [];
        if (existing && existingTokens.length > 0) {
          hydratedFactoryCollections.push({
            chainId: existing.chainId,
            contractAddress: existing.contractAddress,
            ownerAddress: existing.ownerAddress,
            ensSubname: existing.ensSubname,
            standard: existing.standard,
            isFactoryCreated: existing.isFactoryCreated,
            isUpgradeable: existing.isUpgradeable,
            finalizedAt: existing.finalizedAt,
            createdAt: existing.createdAt,
            updatedAt: existing.updatedAt,
            tokenCount: Math.max(existing._count?.tokens || 0, existingTokens.length),
            tokens: existingTokens
          });
          continue;
        }

        const standard = record.standard === "ERC1155" ? "ERC1155" : "ERC721";
        const createdAt = new Date().toISOString();
        const tokens: ReturnType<typeof toTokenApiShape>[] = [];

        if (standard === "ERC721") {
          try {
            const logs = await onchainClient.getLogs({
              address: contractAddress as `0x${string}`,
              event: erc721TransferEvent,
              fromBlock: 0n,
              toBlock: "latest"
            });
            const mintedLogs = logs.filter((log) => String(log.args.from || "").toLowerCase() === ZERO_ADDRESS);
            for (const log of mintedLogs) {
              const tokenId = log.args.tokenId?.toString();
              if (!tokenId) continue;
              try {
                const currentOwner = String(
                  await onchainClient.readContract({
                    address: contractAddress as `0x${string}`,
                    abi: erc721ReadAbi,
                    functionName: "ownerOf",
                    args: [BigInt(tokenId)]
                  })
                ).toLowerCase();
                if (currentOwner !== owner) continue;

                let metadataCid = "";
                try {
                  metadataCid = String(
                    await onchainClient.readContract({
                      address: contractAddress as `0x${string}`,
                      abi: erc721ReadAbi,
                      functionName: "tokenURI",
                      args: [BigInt(tokenId)]
                    })
                  );
                } catch {
                  metadataCid = "";
                }

                tokens.push({
                  id: `chain:${contractAddress}:${tokenId}`,
                  tokenId,
                  creatorAddress: owner,
                  ownerAddress: owner,
                  mintTxHash: log.transactionHash,
                  metadataCid,
                  metadataUrl: buildGatewayUrl(metadataCid),
                  mediaCid: null,
                  mediaUrl: null,
                  immutable: true,
                  mintedAt: createdAt,
                  activeListing: null
                });
              } catch {
                // ignore unreadable token
              }
            }
          } catch {
            // ignore chain hydration failure
          }
        } else {
          try {
            const singleLogs = await onchainClient.getLogs({
              address: contractAddress as `0x${string}`,
              event: erc1155TransferSingleEvent,
              fromBlock: 0n,
              toBlock: "latest"
            });
            const batchLogs = await onchainClient.getLogs({
              address: contractAddress as `0x${string}`,
              event: erc1155TransferBatchEvent,
              fromBlock: 0n,
              toBlock: "latest"
            });

            const tokenIds = new Set<string>();
            const mintTxByTokenId = new Map<string, string>();
            for (const log of singleLogs) {
              if (String(log.args.from || "").toLowerCase() !== ZERO_ADDRESS) continue;
              const tokenId = log.args.id?.toString();
              if (tokenId) {
                tokenIds.add(tokenId);
                if (!mintTxByTokenId.has(tokenId)) {
                  mintTxByTokenId.set(tokenId, log.transactionHash);
                }
              }
            }
            for (const log of batchLogs) {
              if (String(log.args.from || "").toLowerCase() !== ZERO_ADDRESS) continue;
              for (const id of log.args.ids || []) {
                const tokenId = id.toString();
                tokenIds.add(tokenId);
                if (!mintTxByTokenId.has(tokenId)) {
                  mintTxByTokenId.set(tokenId, log.transactionHash);
                }
              }
            }

            for (const tokenId of tokenIds) {
              try {
                const balance = BigInt(
                  await onchainClient.readContract({
                    address: contractAddress as `0x${string}`,
                    abi: erc1155ReadAbi,
                    functionName: "balanceOf",
                    args: [owner as `0x${string}`, BigInt(tokenId)]
                  })
                );
                if (balance <= 0n) continue;

                let metadataCid = "";
                try {
                  metadataCid = String(
                    await onchainClient.readContract({
                      address: contractAddress as `0x${string}`,
                      abi: erc1155ReadAbi,
                      functionName: "uri",
                      args: [BigInt(tokenId)]
                    })
                  );
                } catch {
                  metadataCid = "";
                }

                tokens.push({
                  id: `chain:${contractAddress}:${tokenId}`,
                  tokenId,
                  creatorAddress: owner,
                  ownerAddress: owner,
                  mintTxHash: mintTxByTokenId.get(tokenId) || null,
                  metadataCid,
                  metadataUrl: buildGatewayUrl(metadataCid),
                  mediaCid: null,
                  mediaUrl: null,
                  immutable: true,
                  mintedAt: createdAt,
                  activeListing: null
                });
              } catch {
                // ignore unreadable token
              }
            }
          } catch {
            // ignore chain hydration failure
          }
        }

        hydratedFactoryCollections.push({
          chainId: existing?.chainId || config.chainId,
          contractAddress,
          ownerAddress: owner,
          ensSubname: existing?.ensSubname || String(record.ensSubname || "").trim() || null,
          standard,
          isFactoryCreated: true,
          isUpgradeable: existing?.isUpgradeable ?? true,
          finalizedAt: existing?.finalizedAt || null,
          createdAt: existing?.createdAt || createdAt,
          updatedAt: existing?.updatedAt || createdAt,
          tokenCount: Math.max(existing?._count?.tokens || 0, tokens.length),
          tokens
        });
      }
    } catch {
      // keep DB-only response if chain hydration is unavailable
    }

    const mergedFactoryCollections =
      hydratedFactoryCollections.length > 0
        ? hydratedFactoryCollections
        : collections
            .filter((item: any) => item.isFactoryCreated)
            .map((item: any) => ({
              chainId: item.chainId,
              contractAddress: item.contractAddress,
              ownerAddress: item.ownerAddress,
              ensSubname: item.ensSubname,
              standard: item.standard,
              isFactoryCreated: item.isFactoryCreated,
              isUpgradeable: item.isUpgradeable,
              finalizedAt: item.finalizedAt,
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
              tokenCount: item._count?.tokens || 0,
              tokens: (tokensByCollectionId.get(item.id) || []).map(toTokenApiShape)
            }));

    sendJson(res, 200, {
      ownerAddress: owner,
      counts: {
        linkedProfiles: linkedProfiles.length,
        ownedCollections: Math.max(collections.length, mergedFactoryCollections.length),
        ownedTokens: Math.max(
          ownedTokenCount,
          mergedFactoryCollections.reduce((sum, item) => sum + item.tokens.length, 0)
        ),
        createdTokens: createdTokenCount,
        activeListings
      },
      profiles: linkedProfiles,
      collections: collections.map((item: any) => ({
        chainId: item.chainId,
        contractAddress: item.contractAddress,
        ownerAddress: item.ownerAddress,
        ensSubname: item.ensSubname,
        standard: item.standard,
        isFactoryCreated: item.isFactoryCreated,
        isUpgradeable: item.isUpgradeable,
        finalizedAt: item.finalizedAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        tokenCount: item._count?.tokens || 0
      })),
      factoryCollections: mergedFactoryCollections,
      recentOwnedMints: recentOwnedTokens.map((item: any) => ({
        id: item.id,
        tokenId: item.tokenId,
        mintTxHash: includeMintTxHash ? item.mintTxHash || null : null,
        metadataCid: item.metadataCid,
        metadataUrl: buildGatewayUrl(item.metadataCid),
        mediaCid: item.mediaCid,
        mediaUrl: buildGatewayUrl(item.mediaCid),
        mintedAt: item.mintedAt,
        collection: {
          contractAddress: item.collection.contractAddress,
          ensSubname: item.collection.ensSubname,
          standard: item.collection.standard,
          isFactoryCreated: item.collection.isFactoryCreated
        }
      }))
    });
    return;
  }

  if (req.method === "POST" && path === "/api/profiles/link") {
    if (deps.isRateLimitedImpl(deps.getClientIpImpl(req, config.trustProxy))) {
      sendJson(res, 429, { error: "Too many requests" });
      return;
    }
    const payload = await readJsonBody<ProfileLinkPayload>(req);
    const source = payload.source;
    if (!["ens", "external-subname", "nftfactory-subname"].includes(source)) {
      sendJson(res, 400, { error: "Invalid profile source" });
      return;
    }

    const ownerAddress = String(payload.ownerAddress || "").trim().toLowerCase();
    if (!isAddress(ownerAddress)) {
      sendJson(res, 400, { error: "Invalid ownerAddress" });
      return;
    }

    const normalized = normalizeProfileInput(payload.name, source);
    if (!normalized) {
      sendJson(res, 400, { error: "Invalid profile name" });
      return;
    }
    const requestedRouteSlug = payload.routeSlug ? normalizeRouteSlug(payload.routeSlug) : null;
    if (payload.routeSlug && !requestedRouteSlug) {
      sendJson(res, 400, { error: "Invalid routeSlug" });
      return;
    }
    const finalSlug = requestedRouteSlug || normalized.slug;

    const collectionAddress = String(payload.collectionAddress || "").trim().toLowerCase();
    if (collectionAddress && !isAddress(collectionAddress)) {
      sendJson(res, 400, { error: "Invalid collectionAddress" });
      return;
    }

    const now = new Date().toISOString();
    const current = await readProfileRecords();
    const existingIdentity = current.find(
      (item) =>
        item.fullName === normalized.fullName &&
        item.ownerAddress === ownerAddress &&
        item.source === source &&
        item.collectionAddress === (collectionAddress || null)
    );
    const conflicting = current.find(
      (item) =>
        item.slug === finalSlug &&
        !(
          item.fullName === normalized.fullName &&
          item.ownerAddress === ownerAddress &&
          item.source === source &&
          item.collectionAddress === (collectionAddress || null)
        )
    );
    if (conflicting) {
      sendJson(res, 409, { error: `Route /profile/${finalSlug} is already in use` });
      return;
    }
    const next = current.filter(
      (item) =>
        !(
          item.fullName === normalized.fullName &&
          item.ownerAddress === ownerAddress &&
          item.source === source &&
          item.collectionAddress === (collectionAddress || null)
        )
    );

    next.push({
      slug: finalSlug,
      fullName: normalized.fullName,
      source,
      ownerAddress,
      collectionAddress: collectionAddress || null,
      tagline: sanitizeProfileText(payload.tagline, 120) || existingIdentity?.tagline || null,
      displayName: sanitizeProfileText(payload.displayName, 80) || existingIdentity?.displayName || null,
      bio: sanitizeProfileText(payload.bio, 1200) || existingIdentity?.bio || null,
      bannerUrl: sanitizeProfileUrl(payload.bannerUrl) || existingIdentity?.bannerUrl || null,
      avatarUrl: sanitizeProfileUrl(payload.avatarUrl) || existingIdentity?.avatarUrl || null,
      featuredUrl: sanitizeProfileUrl(payload.featuredUrl) || existingIdentity?.featuredUrl || null,
      accentColor: sanitizeAccentColor(payload.accentColor) || existingIdentity?.accentColor || null,
      links: sanitizeProfileLinks(payload.links).length > 0 ? sanitizeProfileLinks(payload.links) : existingIdentity?.links || [],
      createdAt: existingIdentity?.createdAt || now,
      updatedAt: now
    });
    next.sort((a, b) => a.fullName.localeCompare(b.fullName));
    await writeProfileRecords(next);

    sendJson(res, 200, {
      ok: true,
      profile: {
        slug: finalSlug,
        fullName: normalized.fullName,
        source,
        ownerAddress,
        collectionAddress: collectionAddress || null,
        tagline: sanitizeProfileText(payload.tagline, 120) || existingIdentity?.tagline || null,
        displayName: sanitizeProfileText(payload.displayName, 80) || existingIdentity?.displayName || null,
        bio: sanitizeProfileText(payload.bio, 1200) || existingIdentity?.bio || null,
        bannerUrl: sanitizeProfileUrl(payload.bannerUrl) || existingIdentity?.bannerUrl || null,
        avatarUrl: sanitizeProfileUrl(payload.avatarUrl) || existingIdentity?.avatarUrl || null,
        featuredUrl: sanitizeProfileUrl(payload.featuredUrl) || existingIdentity?.featuredUrl || null,
        accentColor: sanitizeAccentColor(payload.accentColor) || existingIdentity?.accentColor || null,
        links: sanitizeProfileLinks(payload.links).length > 0 ? sanitizeProfileLinks(payload.links) : existingIdentity?.links || [],
        createdAt: existingIdentity?.createdAt || now,
        updatedAt: now
      }
    });
    return;
  }

  if (req.method === "POST" && path === "/api/profiles/transfer") {
    if (deps.isRateLimitedImpl(deps.getClientIpImpl(req, config.trustProxy))) {
      sendJson(res, 429, { error: "Too many requests" });
      return;
    }

    const payload = await readJsonBody<ProfileTransferPayload>(req);
    const slug = normalizeRouteSlug(payload.slug);
    if (!slug) {
      sendJson(res, 400, { error: "Invalid slug" });
      return;
    }

    const currentOwnerAddress = String(payload.currentOwnerAddress || "").trim().toLowerCase();
    if (!isAddress(currentOwnerAddress)) {
      sendJson(res, 400, { error: "Invalid currentOwnerAddress" });
      return;
    }

    const newOwnerAddress = String(payload.newOwnerAddress || "").trim().toLowerCase();
    if (!isAddress(newOwnerAddress)) {
      sendJson(res, 400, { error: "Invalid newOwnerAddress" });
      return;
    }

    if (currentOwnerAddress === newOwnerAddress) {
      sendJson(res, 400, { error: "New owner must be different" });
      return;
    }

    const current = await readProfileRecords();
    const target = current.find((item) => item.slug === slug && item.ownerAddress === currentOwnerAddress);
    if (!target) {
      sendJson(res, 404, { error: `Profile /profile/${slug} was not found for the current owner` });
      return;
    }

    const duplicateForNewOwner = current.find(
      (item) =>
        item.slug === slug &&
        item.ownerAddress === newOwnerAddress &&
        item.fullName === target.fullName &&
        item.source === target.source &&
        item.collectionAddress === target.collectionAddress
    );

    const now = new Date().toISOString();
    const next = current
      .filter(
        (item) =>
          !(
            item.slug === slug &&
            item.ownerAddress === currentOwnerAddress &&
            item.fullName === target.fullName &&
            item.source === target.source &&
            item.collectionAddress === target.collectionAddress
          )
      )
      .map((item) => ({ ...item }));

    const updatedRecord: ProfileRecord = duplicateForNewOwner
      ? {
          ...duplicateForNewOwner,
          tagline: target.tagline,
          displayName: target.displayName,
          bio: target.bio,
          bannerUrl: target.bannerUrl,
          avatarUrl: target.avatarUrl,
          featuredUrl: target.featuredUrl,
          accentColor: target.accentColor,
          links: target.links,
          updatedAt: now
        }
      : {
          ...target,
          ownerAddress: newOwnerAddress,
          updatedAt: now
        };

    if (!duplicateForNewOwner) {
      next.push(updatedRecord);
    } else {
      const deduped = next.filter(
        (item) =>
          !(
            item.slug === duplicateForNewOwner.slug &&
            item.ownerAddress === duplicateForNewOwner.ownerAddress &&
            item.fullName === duplicateForNewOwner.fullName &&
            item.source === duplicateForNewOwner.source &&
            item.collectionAddress === duplicateForNewOwner.collectionAddress
          )
      );
      deduped.push(updatedRecord);
      deduped.sort((a, b) => a.fullName.localeCompare(b.fullName));
      await writeProfileRecords(deduped);
      sendJson(res, 200, { ok: true, profile: toProfileResponse(updatedRecord) });
      return;
    }

    next.sort((a, b) => a.fullName.localeCompare(b.fullName));
    await writeProfileRecords(next);
    sendJson(res, 200, { ok: true, profile: toProfileResponse(updatedRecord) });
    return;
  }

  if (req.method === "GET" && /^\/api\/profile\/[^/]+$/.test(path)) {
    const rawName = String(decodeURIComponent(path.split("/")[3] || "")).trim().toLowerCase();
    const slug = normalizeProfileInput(rawName, rawName.includes(".") ? "external-subname" : "nftfactory-subname")?.slug || "";

    if (!rawName || !slug) {
      sendJson(res, 400, { error: "Invalid profile name" });
      return;
    }

    const linkedProfiles = (await readProfileRecords()).filter(
      (item) => item.slug === slug || item.fullName.toLowerCase() === rawName
    );

    const collectionsBySubname = await deps.prisma.collection.findMany({
      where: {
        OR: [
          { ensSubname: slug },
          { ensSubname: `${slug}.nftfactory.eth` },
          { ensSubname: rawName }
        ]
      },
      select: { ownerAddress: true, ensSubname: true, contractAddress: true }
    });

    const linkedOwnerAddresses = Array.from(new Set(linkedProfiles.map((item) => item.ownerAddress)));
    const collectionsByOwner = linkedOwnerAddresses.length
      ? await deps.prisma.collection.findMany({
          where: {
            ownerAddress: { in: linkedOwnerAddresses }
          },
          select: { ownerAddress: true, ensSubname: true, contractAddress: true }
        })
      : [];

    const collectionMap = new Map<string, { ownerAddress: string; ensSubname: string | null; contractAddress: string }>();
    for (const item of [...collectionsBySubname, ...collectionsByOwner]) {
      collectionMap.set(item.contractAddress.toLowerCase(), {
        ownerAddress: item.ownerAddress,
        ensSubname: item.ensSubname,
        contractAddress: item.contractAddress
      });
    }

    const collections = Array.from(collectionMap.values());

    const sellers = Array.from(
      new Set([
        ...collections.map((item: any) => item.ownerAddress.toLowerCase()),
        ...linkedProfiles.map((item) => item.ownerAddress.toLowerCase())
      ])
    );
    sendJson(res, 200, {
      name: slug,
      sellers,
      profiles: linkedProfiles.map(toProfileResponse),
      collections: collections.map((item: any) => ({
        ensSubname: item.ensSubname,
        contractAddress: item.contractAddress,
        ownerAddress: item.ownerAddress
      }))
    });
    return;
  }

  if (req.method === "GET" && path === "/api/listings") {
    await syncMarketplaceListingsIfStale(deps, config);

    const cursor = Math.max(0, Number.parseInt(String(url.searchParams.get("cursor") || "0"), 10) || 0);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(url.searchParams.get("limit") || "50"), 10) || 50));
    const seller = String(url.searchParams.get("seller") || "").trim().toLowerCase();
    const includeMintTxHash = await hasMintTxHashColumn(deps);

    const where: Record<string, unknown> = { active: true };
    if (seller && isAddress(seller)) {
      where.sellerAddress = seller;
    }

    const rows = await deps.prisma.listing.findMany({
      where,
      orderBy: [
        { updatedAt: "desc" },
        { createdAt: "desc" }
      ],
      skip: cursor,
      take: limit,
      select: {
        listingId: true,
        sellerAddress: true,
        collectionAddress: true,
        tokenId: true,
        paymentToken: true,
        priceRaw: true,
        active: true,
        createdAt: true,
        updatedAt: true,
        token: {
          select: {
            id: true,
            creatorAddress: true,
            ownerAddress: true,
            metadataCid: true,
            mediaCid: true,
            immutable: true,
            mintedAt: true,
            ...(includeMintTxHash ? { mintTxHash: true } : {}),
            collection: {
              select: {
                chainId: true,
                contractAddress: true,
                ownerAddress: true,
                ensSubname: true,
                standard: true,
                isFactoryCreated: true,
                isUpgradeable: true,
                finalizedAt: true,
                createdAt: true,
                updatedAt: true
              }
            }
          }
        }
      }
    });

    sendJson(res, 200, {
      cursor,
      nextCursor: cursor + rows.length,
      canLoadMore: rows.length === limit,
      items: rows.map((item: any) => toListingApiShape(item))
    });
    return;
  }

  if (req.method === "GET" && path === "/api/feed") {
    const limitRaw = Number.parseInt(String(url.searchParams.get("limit") || "50"), 10);
    const cursorRaw = Number.parseInt(String(url.searchParams.get("cursor") || "0"), 10);
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 50;
    const cursor = Number.isInteger(cursorRaw) && cursorRaw >= 0 ? cursorRaw : 0;
    await syncMarketplaceListingsIfStale(deps, config);
    const includeMintTxHash = await hasMintTxHashColumn(deps);

    const items = await (deps.prisma.token as any).findMany({
      take: limit,
      skip: cursor,
      orderBy: [{ mintedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        tokenId: true,
        creatorAddress: true,
        ownerAddress: true,
        ...(includeMintTxHash ? { mintTxHash: true } : {}),
        metadataCid: true,
        mediaCid: true,
        immutable: true,
        mintedAt: true,
        collection: {
          select: {
            chainId: true,
            contractAddress: true,
            ownerAddress: true,
            ensSubname: true,
            standard: true,
            isFactoryCreated: true,
            isUpgradeable: true,
            finalizedAt: true,
            createdAt: true,
            updatedAt: true
          }
        },
        listings: {
          where: { active: true },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            listingId: true,
            sellerAddress: true,
            paymentToken: true,
            priceRaw: true,
            active: true,
            createdAt: true,
            updatedAt: true
          }
        }
      }
    });

    const responseItems = items.map((item: any) => ({
      id: item.id,
      tokenId: item.tokenId,
      creatorAddress: item.creatorAddress,
      ownerAddress: item.ownerAddress,
      mintTxHash: includeMintTxHash ? item.mintTxHash || null : null,
      metadataCid: item.metadataCid,
      metadataUrl: buildGatewayUrl(item.metadataCid),
      mediaCid: item.mediaCid,
      mediaUrl: buildGatewayUrl(item.mediaCid),
      immutable: item.immutable,
      mintedAt: item.mintedAt,
      collection: {
        chainId: item.collection.chainId,
        contractAddress: item.collection.contractAddress,
        ownerAddress: item.collection.ownerAddress,
        ensSubname: item.collection.ensSubname,
        standard: item.collection.standard,
        isFactoryCreated: item.collection.isFactoryCreated,
        isUpgradeable: item.collection.isUpgradeable,
        finalizedAt: item.collection.finalizedAt,
        createdAt: item.collection.createdAt,
        updatedAt: item.collection.updatedAt
      },
      activeListing: item.listings?.[0]
        ? {
            listingId: item.listings[0].listingId,
            sellerAddress: item.listings[0].sellerAddress,
            paymentToken: item.listings[0].paymentToken,
            priceRaw: item.listings[0].priceRaw,
            active: item.listings[0].active,
            createdAt: item.listings[0].createdAt,
            updatedAt: item.listings[0].updatedAt
          }
        : null
    }));

    await attachMintTxHashes(responseItems, config, includeMintTxHash ? deps : undefined);

    sendJson(res, 200, {
      cursor,
      nextCursor: cursor + items.length,
      canLoadMore: items.length === limit,
      items: responseItems
    });
    return;
  }

  if (req.method === "GET" && path === "/api/overview") {
    await syncMarketplaceListingsIfStale(deps, config);
    const [collectionCount, tokenCount, activeListingCount, openReportCount, hiddenListingIds, profiles, paymentTokens, moderators] =
      await Promise.all([
        deps.prisma.collection.count(),
        deps.prisma.token.count(),
        deps.prisma.listing.count({ where: { active: true } }),
        deps.prisma.report.count({ where: { status: "open" } }),
        listHiddenListingIds(deps),
        readProfileRecords(),
        readPaymentTokenRecords(),
        readEffectiveModeratorRecords(config)
      ]);

    sendJson(res, 200, {
      chainId: config.chainId,
      counts: {
        collections: collectionCount,
        tokens: tokenCount,
        activeListings: activeListingCount,
        openReports: openReportCount,
        hiddenListings: hiddenListingIds.length,
        linkedProfiles: profiles.length,
        trackedPaymentTokens: paymentTokens.length,
        moderators: moderators.length
      },
      generatedAt: new Date().toISOString()
    });
    return;
  }

  if (req.method === "GET" && path === "/api/collections") {
    const owner = String(url.searchParams.get("owner") || "").trim().toLowerCase();
    if (!owner || !isAddress(owner)) {
      sendJson(res, 400, { error: "Valid owner query param is required" });
      return;
    }

    const collections = await deps.prisma.collection.findMany({
      where: {
        ownerAddress: owner
      },
      select: {
        chainId: true,
        ownerAddress: true,
        ensSubname: true,
        contractAddress: true,
        standard: true,
        isFactoryCreated: true,
        isUpgradeable: true,
        finalizedAt: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            tokens: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    const contractAddresses = collections.map((item: any) => item.contractAddress.toLowerCase());
    const activeListings = contractAddresses.length
      ? await deps.prisma.listing.findMany({
          where: {
            active: true,
            collectionAddress: { in: contractAddresses }
          },
          select: { collectionAddress: true }
        })
      : [];
    const activeListingCounts = new Map<string, number>();
    for (const item of activeListings as Array<{ collectionAddress: string }>) {
      const key = item.collectionAddress.toLowerCase();
      activeListingCounts.set(key, (activeListingCounts.get(key) || 0) + 1);
    }

    sendJson(res, 200, {
      ownerAddress: owner,
      collections: collections.map((item: any) => ({
        chainId: item.chainId,
        ensSubname: item.ensSubname,
        contractAddress: item.contractAddress,
        ownerAddress: item.ownerAddress,
        standard: item.standard,
        isFactoryCreated: item.isFactoryCreated,
        isUpgradeable: item.isUpgradeable,
        finalizedAt: item.finalizedAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        tokenCount: item._count?.tokens || 0,
        activeListingCount: activeListingCounts.get(item.contractAddress.toLowerCase()) || 0
      }))
    });
    return;
  }

  if (req.method === "GET" && /^\/api\/collections\/[^/]+\/tokens$/.test(path)) {
    const contractAddress = String(decodeURIComponent(path.split("/")[3] || "")).trim().toLowerCase();
    if (!contractAddress || !isAddress(contractAddress)) {
      sendJson(res, 400, { error: "Valid contract address is required" });
      return;
    }
    const includeMintTxHash = await hasMintTxHashColumn(deps);

    const tokens = await (deps.prisma.token as any).findMany({
      where: {
        collection: {
          contractAddress
        }
      },
      orderBy: [{ mintedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        tokenId: true,
        creatorAddress: true,
        ownerAddress: true,
        ...(includeMintTxHash ? { mintTxHash: true } : {}),
        metadataCid: true,
        mediaCid: true,
        immutable: true,
        mintedAt: true,
        collection: {
          select: {
            chainId: true,
            contractAddress: true,
            ownerAddress: true,
            ensSubname: true,
            standard: true,
            isFactoryCreated: true,
            isUpgradeable: true,
            finalizedAt: true,
            createdAt: true,
            updatedAt: true
          }
        },
        listings: {
          where: { active: true },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            listingId: true,
            sellerAddress: true,
            paymentToken: true,
            priceRaw: true,
            active: true,
            createdAt: true,
            updatedAt: true
          }
        }
      }
    });

    sendJson(res, 200, {
      contractAddress,
      count: tokens.length,
      tokens: tokens.map((item: any) => ({
        ...toTokenApiShape(item),
        collection: {
          chainId: item.collection.chainId,
          contractAddress: item.collection.contractAddress,
          ownerAddress: item.collection.ownerAddress,
          ensSubname: item.collection.ensSubname,
          standard: item.collection.standard,
          isFactoryCreated: item.collection.isFactoryCreated,
          isUpgradeable: item.collection.isUpgradeable,
          finalizedAt: item.collection.finalizedAt,
          createdAt: item.collection.createdAt,
          updatedAt: item.collection.updatedAt
        }
      }))
    });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

export function createRequestHandler(
  deps: IndexerDeps,
  config: RequestHandlerConfig
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    handleRequest(req, res, deps, config).catch((err) => {
      if (err instanceof BadRequestError) {
        sendJson(res, 400, { error: err.message });
        return;
      }
      log.error({ err, method: req.method, url: req.url }, "request_error");
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : "Unhandled server error"
      });
    });
  };
}

export async function main() {
  const rpcUrl = assertEnv("RPC_URL");
  const dbUrl = assertEnv("DATABASE_URL");

  if (!ADMIN_TOKEN && ADMIN_ALLOWLIST.size === 0) {
    log.warn("No INDEXER_ADMIN_TOKEN or INDEXER_ADMIN_ALLOWLIST configured — admin endpoints are unprotected");
  }

  log.info({ rpcUrl, db: dbUrl.slice(0, 18) + "..." }, "Indexer booting");

  const handler = createRequestHandler(
    {
      prisma,
      getClientIpImpl: getClientIp,
      isRateLimitedImpl: isRateLimited
    },
    {
      chainId: CHAIN_ID,
      rpcUrl,
      adminToken: ADMIN_TOKEN,
      adminAllowlist: ADMIN_ALLOWLIST,
      trustProxy: TRUST_PROXY,
      marketplaceAddress:
        MARKETPLACE_ADDRESS && isAddress(MARKETPLACE_ADDRESS.toLowerCase())
          ? (MARKETPLACE_ADDRESS.toLowerCase() as `0x${string}`)
          : null,
      registryAddress:
        REGISTRY_ADDRESS && isAddress(REGISTRY_ADDRESS.toLowerCase())
          ? (REGISTRY_ADDRESS.toLowerCase() as `0x${string}`)
          : null,
      moderatorRegistryAddress:
        MODERATOR_REGISTRY_ADDRESS && isAddress(MODERATOR_REGISTRY_ADDRESS.toLowerCase())
          ? (MODERATOR_REGISTRY_ADDRESS.toLowerCase() as `0x${string}`)
          : null
    }
  );
  const server = createServer(handler);

  server.listen(PORT, HOST, () => {
    log.info({ host: HOST, port: PORT }, "Indexer API listening");
  });

  setInterval(() => {
    log.debug("heartbeat");
  }, 15000);
}

if (process.env.NODE_ENV !== "test") {
  main().catch((err) => {
    log.fatal({ err }, "Fatal startup error");
    process.exit(1);
  });
}
