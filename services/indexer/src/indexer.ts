import "dotenv/config";

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";
import { PrismaClient } from "@prisma/client";

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

const CHAIN_ID = Number.parseInt(process.env.CHAIN_ID || "11155111", 10);
const PORT = Number.parseInt(process.env.INDEXER_PORT || "8787", 10);
const ADMIN_TOKEN = process.env.INDEXER_ADMIN_TOKEN || "";
const ADMIN_ALLOWLIST = new Set(
  (process.env.INDEXER_ADMIN_ALLOWLIST || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);

const prisma = new PrismaClient();

function assertEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function normalizeSubname(input: string): string {
  return input.trim().toLowerCase().replace(/\.nftfactory\.eth$/, "");
}

function parseBearerToken(header: string | undefined): string {
  if (!header) return "";
  const [scheme, token] = header.split(" ");
  if (!scheme || !token) return "";
  if (scheme.toLowerCase() !== "bearer") return "";
  return token.trim();
}

function assertAdminRequest(req: IncomingMessage, actor?: string): { ok: true } | { ok: false; error: string } {
  if (ADMIN_TOKEN) {
    const authToken = parseBearerToken(req.headers.authorization);
    if (!authToken || authToken !== ADMIN_TOKEN) {
      return { ok: false, error: "Missing or invalid admin token" };
    }
  }

  if (ADMIN_ALLOWLIST.size > 0) {
    const headerActor = String(req.headers["x-admin-address"] || "").trim().toLowerCase();
    const payloadActor = String(actor || "").trim().toLowerCase();
    const candidate = headerActor || payloadActor;
    if (!candidate || !isAddress(candidate) || !ADMIN_ALLOWLIST.has(candidate)) {
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
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(payload));
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) throw new Error("Missing JSON body");
  return JSON.parse(raw) as T;
}

async function ensureTokenForListing(payload: CreateReportPayload): Promise<{ tokenRefId: string; listingRowId: string }> {
  const collectionAddress = payload.collectionAddress.toLowerCase();
  const sellerAddress = payload.sellerAddress.toLowerCase();
  const standard = (payload.standard || "UNKNOWN").toUpperCase();

  const collection = await prisma.collection.upsert({
    where: { contractAddress: collectionAddress },
    update: {
      ownerAddress: sellerAddress,
      standard
    },
    create: {
      chainId: CHAIN_ID,
      contractAddress: collectionAddress,
      ownerAddress: sellerAddress,
      standard,
      isFactoryCreated: true,
      isUpgradeable: true
    }
  });

  const token = await prisma.token.upsert({
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

  const listing = await prisma.listing.upsert({
    where: { listingId: String(payload.listingId) },
    update: {
      chainId: CHAIN_ID,
      collectionAddress,
      tokenId: payload.tokenId,
      sellerAddress,
      paymentToken: "0x0000000000000000000000000000000000000000",
      priceRaw: "0",
      tokenRefId: token.id
    },
    create: {
      listingId: String(payload.listingId),
      chainId: CHAIN_ID,
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

async function listHiddenListingIds(): Promise<number[]> {
  const actions = await prisma.moderationAction.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      tokenId: true,
      action: true
    }
  });

  const hiddenByToken = new Map<string, boolean>();
  for (const action of actions) {
    if (hiddenByToken.has(action.tokenId)) continue;
    hiddenByToken.set(action.tokenId, action.action.toLowerCase() === "hide");
  }

  const hiddenTokenIds = Array.from(hiddenByToken.entries())
    .filter(([, hidden]) => hidden)
    .map(([tokenId]) => tokenId);

  if (hiddenTokenIds.length === 0) return [];

  const listings = await prisma.listing.findMany({
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

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
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
    const reports = await prisma.report.findMany({
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
        listingId: report.token.listings[0]?.listingId ? Number.parseInt(report.token.listings[0].listingId, 10) : null,
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
      !payload.tokenId?.trim() ||
      !payload.reason?.trim()
    ) {
      sendJson(res, 400, { error: "Invalid report payload" });
      return;
    }

    const { tokenRefId } = await ensureTokenForListing(payload);
    const report = await prisma.report.create({
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
    const reportId = path.split("/")[4];
    const payload = await readJsonBody<ResolveReportPayload>(req);

    if (!payload.action || !payload.actor?.trim()) {
      sendJson(res, 400, { error: "Invalid resolve payload" });
      return;
    }
    const auth = assertAdminRequest(req, payload.actor);
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return;
    }

    const report = await prisma.report.findUnique({
      where: { id: reportId }
    });
    if (!report) {
      sendJson(res, 404, { error: "Report not found" });
      return;
    }

    await prisma.report.update({
      where: { id: reportId },
      data: { status: "resolved" }
    });

    await prisma.moderationAction.create({
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
    const actions = await prisma.moderationAction.findMany({
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
        listingId: action.token.listings[0]?.listingId ? Number.parseInt(action.token.listings[0].listingId, 10) : null,
        createdAt: action.createdAt.toISOString()
      }))
    );
    return;
  }

  if (req.method === "GET" && path === "/api/moderation/hidden-listings") {
    const listingIds = await listHiddenListingIds();
    sendJson(res, 200, { listingIds });
    return;
  }

  if (req.method === "POST" && /^\/api\/moderation\/listings\/[^/]+\/visibility$/.test(path)) {
    const listingId = path.split("/")[4];
    const payload = await readJsonBody<SetListingVisibilityPayload>(req);
    const auth = assertAdminRequest(req, payload.actor);
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return;
    }
    const listing = await prisma.listing.findUnique({
      where: { listingId },
      select: { tokenRefId: true }
    });

    if (!listing?.tokenRefId) {
      sendJson(res, 404, { error: "Listing not found in indexer DB" });
      return;
    }

    await prisma.moderationAction.create({
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

  if (req.method === "POST" && path === "/api/admin/collections/backfill-subname") {
    const payload = await readJsonBody<BackfillSubnamePayload>(req);
    const auth = assertAdminRequest(req);
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

    const result = await prisma.collection.updateMany({
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

    const collections = await prisma.collection.findMany({
      where: {
        OR: [{ ensSubname: label }, { ensSubname: `${label}.nftfactory.eth` }]
      },
      select: { ownerAddress: true, ensSubname: true, contractAddress: true }
    });

    const sellers = Array.from(new Set(collections.map((item: any) => item.ownerAddress.toLowerCase())));
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

async function main() {
  const rpcUrl = assertEnv("RPC_URL");
  const dbUrl = assertEnv("DATABASE_URL");

  console.log("Indexer booting...");
  console.log(`RPC: ${rpcUrl}`);
  console.log(`DB: ${dbUrl.slice(0, 18)}...`);

  const server = createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      console.error("request_error", err);
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : "Unhandled server error"
      });
    });
  });

  server.listen(PORT, () => {
    console.log(`Indexer API listening on http://127.0.0.1:${PORT}`);
  });

  setInterval(() => {
    console.log("Indexer heartbeat", new Date().toISOString());
  }, 15000);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
