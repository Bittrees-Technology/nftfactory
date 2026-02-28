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

type ProfileLinkSource = "ens" | "external-subname" | "nftfactory-subname";

type ProfileLinkPayload = {
  name: string;
  source: ProfileLinkSource;
  ownerAddress: string;
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

const CHAIN_ID = Number.parseInt(process.env.CHAIN_ID || "11155111", 10);
const PORT = Number.parseInt(process.env.INDEXER_PORT || "8787", 10);
const HOST = process.env.INDEXER_HOST || "127.0.0.1";
const ADMIN_TOKEN = process.env.INDEXER_ADMIN_TOKEN || "";
const TRUST_PROXY = process.env.TRUST_PROXY === "true";
const MODERATOR_FILE = process.env.INDEXER_MODERATOR_FILE || path.join(process.cwd(), "data", "moderators.json");
const PROFILE_FILE = process.env.INDEXER_PROFILE_FILE || path.join(process.cwd(), "data", "profiles.json");
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
      update: async () => ({})
    },
    moderationAction: {
      findMany: async () => [],
      create: async () => ({})
    },
    listing: {
      findMany: async () => [],
      findUnique: async () => null,
      upsert: async () => ({})
    },
    collection: {
      findMany: async () => [],
      updateMany: async () => ({ count: 0 }),
      upsert: async () => ({}),
      count: async () => 0
    },
    token: {
      upsert: async () => ({})
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
  const firstLabel = fullName.split(".")[0] || "";
  const slug = normalizeSubname(firstLabel);
  if (!fullName || !slug) return null;

  return {
    slug,
    fullName
  };
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
    for (const item of [...linkedProfiles, ...derivedProfiles]) {
      const key = `${item.slug}:${item.ownerAddress}:${item.collectionAddress || ""}:${item.source}`;
      if (!merged.has(key)) merged.set(key, item);
    }

    sendJson(res, 200, {
      ownerAddress: owner,
      profiles: Array.from(merged.values()).sort((a, b) => a.fullName.localeCompare(b.fullName))
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

    const collectionAddress = String(payload.collectionAddress || "").trim().toLowerCase();
    if (collectionAddress && !isAddress(collectionAddress)) {
      sendJson(res, 400, { error: "Invalid collectionAddress" });
      return;
    }

    const now = new Date().toISOString();
    const current = await readProfileRecords();
    const existing = current.find(
      (item) =>
        item.slug === normalized.slug &&
        item.ownerAddress === ownerAddress &&
        item.source === source &&
        item.collectionAddress === (collectionAddress || null)
    );
    const next = current.filter(
      (item) =>
        !(
          item.slug === normalized.slug &&
          item.ownerAddress === ownerAddress &&
          item.source === source &&
          item.collectionAddress === (collectionAddress || null)
        )
    );

    next.push({
      slug: normalized.slug,
      fullName: normalized.fullName,
      source,
      ownerAddress,
      collectionAddress: collectionAddress || null,
      tagline: sanitizeProfileText(payload.tagline, 120) || existing?.tagline || null,
      displayName: sanitizeProfileText(payload.displayName, 80) || existing?.displayName || null,
      bio: sanitizeProfileText(payload.bio, 1200) || existing?.bio || null,
      bannerUrl: sanitizeProfileUrl(payload.bannerUrl) || existing?.bannerUrl || null,
      avatarUrl: sanitizeProfileUrl(payload.avatarUrl) || existing?.avatarUrl || null,
      featuredUrl: sanitizeProfileUrl(payload.featuredUrl) || existing?.featuredUrl || null,
      accentColor: sanitizeAccentColor(payload.accentColor) || existing?.accentColor || null,
      links: sanitizeProfileLinks(payload.links).length > 0 ? sanitizeProfileLinks(payload.links) : existing?.links || [],
      createdAt: existing?.createdAt || now,
      updatedAt: now
    });
    next.sort((a, b) => a.fullName.localeCompare(b.fullName));
    await writeProfileRecords(next);

    sendJson(res, 200, {
      ok: true,
      profile: {
        slug: normalized.slug,
        fullName: normalized.fullName,
        source,
        ownerAddress,
        collectionAddress: collectionAddress || null,
        tagline: sanitizeProfileText(payload.tagline, 120) || existing?.tagline || null,
        displayName: sanitizeProfileText(payload.displayName, 80) || existing?.displayName || null,
        bio: sanitizeProfileText(payload.bio, 1200) || existing?.bio || null,
        bannerUrl: sanitizeProfileUrl(payload.bannerUrl) || existing?.bannerUrl || null,
        avatarUrl: sanitizeProfileUrl(payload.avatarUrl) || existing?.avatarUrl || null,
        featuredUrl: sanitizeProfileUrl(payload.featuredUrl) || existing?.featuredUrl || null,
        accentColor: sanitizeAccentColor(payload.accentColor) || existing?.accentColor || null,
        links: sanitizeProfileLinks(payload.links).length > 0 ? sanitizeProfileLinks(payload.links) : existing?.links || [],
        createdAt: existing?.createdAt || now,
        updatedAt: now
      }
    });
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
      select: { ownerAddress: true, ensSubname: true, contractAddress: true },
      orderBy: { createdAt: "desc" }
    });

    sendJson(res, 200, {
      ownerAddress: owner,
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
