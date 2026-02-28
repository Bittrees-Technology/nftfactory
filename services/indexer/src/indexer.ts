import "dotenv/config";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { URL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { pino } from "pino";
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

const CHAIN_ID = Number.parseInt(process.env.CHAIN_ID || "11155111", 10);
const PORT = Number.parseInt(process.env.INDEXER_PORT || "8787", 10);
const HOST = process.env.INDEXER_HOST || "127.0.0.1";
const ADMIN_TOKEN = process.env.INDEXER_ADMIN_TOKEN || "";
const TRUST_PROXY = process.env.TRUST_PROXY === "true";
const MODERATOR_FILE = process.env.INDEXER_MODERATOR_FILE || path.join(process.cwd(), "data", "moderators.json");
const ADMIN_ALLOWLIST = new Set(
  (process.env.INDEXER_ADMIN_ALLOWLIST || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);

const prisma = new PrismaClient();
const RESOLVE_ACTIONS = new Set(["hide", "restore", "dismiss"]);

class BadRequestError extends Error {}
type RequestHandlerConfig = {
  chainId: number;
  adminToken: string;
  adminAllowlist: Set<string>;
  trustProxy: boolean;
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

async function writeModeratorRecords(records: ModeratorRecord[]): Promise<void> {
  await mkdir(path.dirname(MODERATOR_FILE), { recursive: true });
  await writeFile(MODERATOR_FILE, JSON.stringify(records, null, 2), "utf8");
}

async function getEffectiveAdminAllowlist(
  config: RequestHandlerConfig,
  includeDynamicModerators: boolean
): Promise<Set<string>> {
  const allowlist = new Set(config.adminAllowlist);
  if (!includeDynamicModerators) return allowlist;
  const records = await readModeratorRecords();
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
    sendJson(res, 200, { ok: true, service: "indexer-api" });
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

    const moderators = await readModeratorRecords();
    sendJson(res, 200, { moderators });
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

  if (req.method === "GET" && /^\/api\/profile\/[^/]+$/.test(path)) {
    const name = decodeURIComponent(path.split("/")[3] || "");
    const label = normalizeSubname(name);

    if (!label) {
      sendJson(res, 400, { error: "Invalid profile name" });
      return;
    }

    const collections = await deps.prisma.collection.findMany({
      where: {
        OR: [{ ensSubname: label }, { ensSubname: `${label}.nftfactory.eth` }]
      },
      select: { ownerAddress: true, ensSubname: true, contractAddress: true }
    });

    const sellers = Array.from(
      new Set(collections.map((item: any) => item.ownerAddress.toLowerCase()))
    );
    sendJson(res, 200, {
      name: label,
      sellers,
      collections: collections.map((item: any) => ({
        ensSubname: item.ensSubname,
        contractAddress: item.contractAddress,
        ownerAddress: item.ownerAddress
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
      adminToken: ADMIN_TOKEN,
      adminAllowlist: ADMIN_ALLOWLIST,
      trustProxy: TRUST_PROXY
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
