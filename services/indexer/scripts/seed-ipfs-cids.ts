import "dotenv/config";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
loadEnv({ path: resolve(repoRoot, "services/indexer/.env"), override: false });
loadEnv({ path: resolve(repoRoot, "apps/web/.env.local"), override: false });

const prisma = new PrismaClient();

const DEFAULT_KUBO_API_URL = "http://127.0.0.1:5001";
const DEFAULT_GATEWAY_URL = "https://dweb.link/ipfs";
const REPORT_PATH = resolve(repoRoot, "services/indexer", "data", "ipfs-seed-report.json");

type TokenCidRecord = {
  collectionAddress: string;
  tokenId: string;
  field: "metadata" | "media";
  value: string;
};

type SeedResult = {
  cid: string;
  sourceCount: number;
  fields: string[];
  status: "already-pinned" | "pinned" | "readded-and-pinned" | "failed";
  detail: string;
  examples: Array<{ collectionAddress: string; tokenId: string; field: string; value: string }>;
};

type SeedTarget = {
  cid: string;
  sourceCount: number;
  fields: string[];
  examples: Array<{ collectionAddress: string; tokenId: string; field: string; value: string }>;
};

function getArg(name: string): string | null {
  const index = process.argv.findIndex((arg) => arg === name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function extractRootCid(value: string | null | undefined): string | null {
  const normalized = String(value || "").trim();
  if (!normalized) return null;

  if (normalized.startsWith("ipfs://")) {
    const withoutScheme = normalized.replace(/^ipfs:\/\//, "");
    return withoutScheme.split("/")[0] || null;
  }

  try {
    const url = new URL(normalized);
    const ipfsIndex = url.pathname.indexOf("/ipfs/");
    if (ipfsIndex >= 0) {
      const remainder = url.pathname.slice(ipfsIndex + "/ipfs/".length);
      return remainder.split("/")[0] || null;
    }
  } catch {
    // Ignore non-URL values.
  }

  return null;
}

function buildIpfsApiUrl(baseUrl: string, endpoint: string, params?: Record<string, string>): string {
  const url = new URL(baseUrl.trim() || DEFAULT_KUBO_API_URL);
  const pathname = url.pathname.replace(/\/+$/, "");

  if (pathname.endsWith(`/api/v0/${endpoint}`)) {
    url.pathname = pathname;
  } else if (pathname.endsWith("/api/v0")) {
    url.pathname = `${pathname}/${endpoint}`;
  } else {
    url.pathname = `${pathname}/api/v0/${endpoint}`;
  }

  for (const [key, value] of Object.entries(params || {})) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function buildKuboAuthHeaders(): HeadersInit {
  const bearerToken = String(process.env.IPFS_API_BEARER_TOKEN || "").trim();
  if (bearerToken) {
    return { Authorization: `Bearer ${bearerToken}` };
  }

  const username = String(process.env.IPFS_API_BASIC_AUTH_USERNAME || "").trim();
  const password = String(process.env.IPFS_API_BASIC_AUTH_PASSWORD || "").trim();
  if (username && password) {
    return {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`
    };
  }

  return {};
}

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 45_000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function isPinned(baseUrl: string, cid: string, headers: HeadersInit): Promise<boolean> {
  const response = await fetchWithTimeout(
    buildIpfsApiUrl(baseUrl, "pin/ls", { arg: cid, type: "recursive" }),
    {
      method: "POST",
      headers
    }
  );
  if (response.ok) return true;
  const text = await response.text().catch(() => "");
  return !/not pinned|bad request|not found/i.test(text);
}

async function pinCid(baseUrl: string, cid: string, headers: HeadersInit): Promise<void> {
  const response = await fetchWithTimeout(
    buildIpfsApiUrl(baseUrl, "pin/add", { arg: cid, recursive: "true" }),
    {
      method: "POST",
      headers
    },
    180_000
  );
  if (!response.ok) {
    throw new Error(`pin/add failed (${response.status}): ${await response.text()}`);
  }
}

async function readdFromGateway(
  baseUrl: string,
  gatewayBase: string,
  cid: string,
  headers: HeadersInit
): Promise<string> {
  const gatewayUrl = `${gatewayBase.replace(/\/$/, "")}/${cid}`;
  const gatewayResponse = await fetchWithTimeout(gatewayUrl, { method: "GET" }, 90_000);
  if (!gatewayResponse.ok) {
    throw new Error(`legacy gateway fetch failed (${gatewayResponse.status})`);
  }
  const bytes = await gatewayResponse.arrayBuffer();
  const form = new FormData();
  form.append("file", new Blob([bytes]), `${cid}.bin`);

  const response = await fetchWithTimeout(
    buildIpfsApiUrl(baseUrl, "add", {
      pin: "false",
      "cid-version": "1",
      "wrap-with-directory": "false",
      progress: "false",
      "stream-channels": "false",
      quieter: "true"
    }),
    {
      method: "POST",
      headers,
      body: form
    },
    180_000
  );
  if (!response.ok) {
    throw new Error(`fallback add failed (${response.status}): ${await response.text()}`);
  }
  const text = (await response.text()).trim();
  const parsed = JSON.parse(text) as { Hash?: string };
  const hash = String(parsed.Hash || "").trim();
  if (!hash) {
    throw new Error("fallback add returned no hash");
  }
  if (hash.toLowerCase() !== cid.toLowerCase()) {
    throw new Error(`fallback add hash mismatch: expected ${cid}, got ${hash}`);
  }
  await pinCid(baseUrl, cid, headers);
  return hash;
}

async function main(): Promise<void> {
  const limitValue = Number.parseInt(getArg("--limit") || "0", 10);
  const dryRun = hasFlag("--dry-run");
  const fromReport = hasFlag("--from-report");

  const kuboApiUrl = String(process.env.KUBO_API_URL || process.env.IPFS_API_URL || DEFAULT_KUBO_API_URL).trim();
  const legacyGateway = String(process.env.LEGACY_IPFS_GATEWAY || process.env.NEXT_PUBLIC_IPFS_GATEWAY || DEFAULT_GATEWAY_URL).trim();
  const headers = buildKuboAuthHeaders();

  let collections = 0;
  let tokenCount = 0;
  let cidReferenceCount = 0;
  let targets: SeedTarget[] = [];

  if (!fromReport) {
    try {
      collections = await prisma.collection.count();
      const tokens = await (prisma.token as any).findMany({
        select: {
          tokenId: true,
          metadataCid: true,
          mediaCid: true,
          collection: {
            select: {
              contractAddress: true
            }
          }
        }
      });

      tokenCount = tokens.length;
      const records: TokenCidRecord[] = [];
      for (const token of tokens as Array<any>) {
        if (String(token.metadataCid || "").trim()) {
          records.push({
            collectionAddress: token.collection.contractAddress,
            tokenId: token.tokenId,
            field: "metadata",
            value: token.metadataCid
          });
        }
        if (String(token.mediaCid || "").trim()) {
          records.push({
            collectionAddress: token.collection.contractAddress,
            tokenId: token.tokenId,
            field: "media",
            value: token.mediaCid
          });
        }
      }

      cidReferenceCount = records.length;
      const cidMap = new Map<string, TokenCidRecord[]>();
      for (const record of records) {
        const cid = extractRootCid(record.value);
        if (!cid) continue;
        const list = cidMap.get(cid) || [];
        list.push(record);
        cidMap.set(cid, list);
      }

      targets = [...cidMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([cid, cidRecords]) => ({
          cid,
          sourceCount: cidRecords.length,
          fields: [...new Set(cidRecords.map((record) => record.field))],
          examples: cidRecords.slice(0, 5).map((record) => ({
            collectionAddress: record.collectionAddress,
            tokenId: record.tokenId,
            field: record.field,
            value: record.value
          }))
        }));
    } catch (error) {
      console.warn(`DB scan failed, falling back to ${REPORT_PATH}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (fromReport || targets.length === 0) {
    const raw = JSON.parse(await readFile(REPORT_PATH, "utf8")) as {
      results?: SeedResult[];
      collections?: number;
      tokens?: number;
      cidReferences?: number;
    };
    targets = Array.isArray(raw.results)
      ? raw.results.map((item) => ({
          cid: item.cid,
          sourceCount: item.sourceCount,
          fields: item.fields,
          examples: item.examples
        }))
      : [];
    collections = raw.collections || collections;
    tokenCount = raw.tokens || tokenCount;
    cidReferenceCount = raw.cidReferences || cidReferenceCount;
  }

  if (limitValue > 0) {
    targets = targets.slice(0, limitValue);
  }

  console.log(`Collections in DB : ${collections}`);
  console.log(`Tokens in DB      : ${tokenCount}`);
  console.log(`CID references    : ${cidReferenceCount}`);
  console.log(`Unique root CIDs  : ${targets.length}`);
  console.log(`Kubo API          : ${kuboApiUrl}`);
  console.log(`Legacy gateway    : ${legacyGateway}`);
  if (dryRun) {
    console.log("Mode              : dry-run");
  }
  console.log("");

  const results: SeedResult[] = [];
  let alreadyPinned = 0;
  let pinned = 0;
  let readded = 0;
  let failed = 0;

  for (const target of targets) {
    const { cid, fields, examples, sourceCount } = target;

    try {
      const pinnedAlready = dryRun ? false : await isPinned(kuboApiUrl, cid, headers);
      if (pinnedAlready) {
        alreadyPinned += 1;
        results.push({
          cid,
          sourceCount,
          fields,
          status: "already-pinned",
          detail: "already pinned in Kubo",
          examples
        });
        console.log(`= ${cid} already pinned`);
        continue;
      }

      if (dryRun) {
        results.push({
          cid,
          sourceCount,
          fields,
          status: "pinned",
          detail: "dry-run: would pin",
          examples
        });
        console.log(`~ ${cid} would pin`);
        continue;
      }

      try {
        await pinCid(kuboApiUrl, cid, headers);
        pinned += 1;
        results.push({
          cid,
          sourceCount,
          fields,
          status: "pinned",
          detail: "pinned via pin/add",
          examples
        });
        console.log(`+ ${cid} pinned via pin/add`);
      } catch (error) {
        try {
          await readdFromGateway(kuboApiUrl, legacyGateway, cid, headers);
          readded += 1;
          results.push({
            cid,
            sourceCount,
            fields,
            status: "readded-and-pinned",
            detail: "re-added from legacy gateway and pinned",
            examples
          });
          console.log(`+ ${cid} re-added from legacy gateway`);
        } catch (fallbackError) {
          failed += 1;
          const detail = [
            error instanceof Error ? error.message : String(error),
            fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
          ].join(" | fallback: ");
          results.push({
            cid,
            sourceCount,
            fields,
            status: "failed",
            detail,
            examples
          });
          console.log(`! ${cid} failed`);
        }
      }
    } catch (error) {
      failed += 1;
      results.push({
        cid,
        sourceCount,
        fields,
        status: "failed",
        detail: error instanceof Error ? error.message : String(error),
        examples
      });
      console.log(`! ${cid} failed`);
    }
  }

  await mkdir(resolve(repoRoot, "services/indexer", "data"), { recursive: true });
  await writeFile(
    REPORT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        dryRun,
        kuboApiUrl,
        legacyGateway,
        collections,
        tokens: tokenCount,
        cidReferences: cidReferenceCount,
        uniqueRootCids: targets.length,
        summary: {
          alreadyPinned,
          pinned,
          readded,
          failed
        },
        results
      },
      null,
      2
    )
  );

  console.log("");
  console.log(`already pinned : ${alreadyPinned}`);
  console.log(`pinned         : ${pinned}`);
  console.log(`re-added       : ${readded}`);
  console.log(`failed         : ${failed}`);
  console.log(`report         : ${REPORT_PATH}`);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
