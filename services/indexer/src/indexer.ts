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
  listingId?: number;
  listingRecordId?: string;
  marketplaceVersion?: string;
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

type BackfillCollectionTokensPayload = {
  contractAddress: string;
  ownerAddress?: string;
  standard?: string;
  ensSubname?: string | null;
  isFactoryCreated?: boolean;
  isUpgradeable?: boolean;
  fromBlock?: number;
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

type SyncMintedTokenPayload = {
  chainId?: number;
  contractAddress: string;
  collectionOwnerAddress?: string;
  tokenId: string;
  creatorAddress: string;
  ownerAddress: string;
  standard?: string;
  isFactoryCreated?: boolean;
  isUpgradeable?: boolean;
  ensSubname?: string | null;
  finalizedAt?: string | null;
  mintTxHash?: string | null;
  draftName?: string | null;
  draftDescription?: string | null;
  mintedAmountRaw?: string | null;
  metadataCid: string;
  mediaCid?: string | null;
  immutable?: boolean;
  mintedAt?: string;
};

const CHAIN_ID = Number.parseInt(process.env.CHAIN_ID || "11155111", 10);
const PORT = Number.parseInt(process.env.INDEXER_PORT || "8787", 10);
const HOST = process.env.INDEXER_HOST || "127.0.0.1";
const ADMIN_TOKEN = process.env.INDEXER_ADMIN_TOKEN || "";
const TRUST_PROXY = process.env.TRUST_PROXY === "true";
const MODERATOR_REGISTRY_ADDRESS = process.env.MODERATOR_REGISTRY_ADDRESS || "";
const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS || process.env.NEXT_PUBLIC_REGISTRY_ADDRESS || "";
const MARKETPLACE_ADDRESS = process.env.MARKETPLACE_ADDRESS || process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS || "";
const MARKETPLACE_V2_ADDRESS = process.env.MARKETPLACE_V2_ADDRESS || process.env.NEXT_PUBLIC_MARKETPLACE_V2_ADDRESS || "";
const MODERATOR_FILE = process.env.INDEXER_MODERATOR_FILE || path.join(process.cwd(), "data", "moderators.json");
const PROFILE_FILE = process.env.INDEXER_PROFILE_FILE || path.join(process.cwd(), "data", "profiles.json");
const PAYMENT_TOKEN_FILE = process.env.INDEXER_PAYMENT_TOKEN_FILE || path.join(process.cwd(), "data", "payment-tokens.json");
const TOKEN_PRESENTATION_FILE =
  process.env.INDEXER_TOKEN_PRESENTATION_FILE || path.join(process.cwd(), "data", "token-presentation.json");
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
      updateMany: async () => ({ count: 0 }),
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
      findFirst: async () => null,
      upsert: async () => ({}),
      update: async () => ({}),
      count: async () => 0
    },
    tokenHolding: {
      findMany: async () => [],
      findUnique: async () => null,
      upsert: async () => ({}),
      deleteMany: async () => ({ count: 0 }),
      count: async () => 0
    },
    offer: {
      findMany: async () => [],
      findUnique: async () => null,
      count: async () => 0,
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
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

class BadRequestError extends Error {}
type RequestHandlerConfig = {
  chainId: number;
  rpcUrl: string;
  adminToken: string;
  adminAllowlist: Set<string>;
  trustProxy: boolean;
  marketplaceAddress: `0x${string}` | null;
  marketplaceV2Address: `0x${string}` | null;
  registryAddress: `0x${string}` | null;
  moderatorRegistryAddress: `0x${string}` | null;
};
type IndexerDeps = {
  prisma: PrismaClient;
  getClientIpImpl: typeof getClientIp;
  isRateLimitedImpl: typeof isRateLimited;
};

type TokenPresentationRecord = {
  contractAddress: string;
  tokenId: string;
  draftName: string | null;
  draftDescription: string | null;
  mintedAmountRaw: string | null;
  updatedAt: string;
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

const erc165ReadAbi = [
  {
    type: "function",
    name: "supportsInterface",
    stateMutability: "view",
    inputs: [{ name: "interfaceId", type: "bytes4" }],
    outputs: [{ name: "", type: "bool" }]
  }
] as const;

const ownableReadAbi = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  }
] as const;

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

const marketplaceV2ReadAbi = [
  ...marketplaceReadAbi,
  {
    type: "function",
    name: "nextOfferId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "offers",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "buyer", type: "address" },
      { name: "nft", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "quantity", type: "uint256" },
      { name: "standard", type: "string" },
      { name: "paymentToken", type: "address" },
      { name: "price", type: "uint256" },
      { name: "expiresAt", type: "uint256" },
      { name: "active", type: "bool" }
    ]
  }
] as const;

const marketplaceSaleEvent = {
  type: "event",
  name: "Sale",
  inputs: [
    { indexed: true, name: "listingId", type: "uint256" },
    { indexed: true, name: "buyer", type: "address" },
    { indexed: false, name: "price", type: "uint256" },
    { indexed: false, name: "paymentToken", type: "address" }
  ]
} as const;

const marketplaceCancelledEvent = {
  type: "event",
  name: "Cancelled",
  inputs: [{ indexed: true, name: "listingId", type: "uint256" }]
} as const;

const marketplaceOfferCreatedEvent = {
  type: "event",
  name: "OfferCreated",
  inputs: [
    { indexed: true, name: "offerId", type: "uint256" },
    { indexed: true, name: "buyer", type: "address" },
    { indexed: true, name: "nft", type: "address" },
    { indexed: false, name: "tokenId", type: "uint256" },
    { indexed: false, name: "quantity", type: "uint256" },
    { indexed: false, name: "standard", type: "string" },
    { indexed: false, name: "paymentToken", type: "address" },
    { indexed: false, name: "price", type: "uint256" },
    { indexed: false, name: "expiresAt", type: "uint256" }
  ]
} as const;

const marketplaceOfferCancelledEvent = {
  type: "event",
  name: "OfferCancelled",
  inputs: [{ indexed: true, name: "offerId", type: "uint256" }]
} as const;

const marketplaceOfferAcceptedEvent = {
  type: "event",
  name: "OfferAccepted",
  inputs: [
    { indexed: true, name: "offerId", type: "uint256" },
    { indexed: true, name: "seller", type: "address" },
    { indexed: true, name: "buyer", type: "address" },
    { indexed: false, name: "nft", type: "address" },
    { indexed: false, name: "tokenId", type: "uint256" },
    { indexed: false, name: "quantity", type: "uint256" },
    { indexed: false, name: "paymentToken", type: "address" },
    { indexed: false, name: "price", type: "uint256" }
  ]
} as const;

const LISTING_SYNC_BATCH_SIZE = 20;
const LISTING_SYNC_TTL_MS = 30_000;
const MARKETPLACE_V2_SYNC_TTL_MS = 30_000;
let lastListingSyncAt = 0;
let lastListingSyncCount = 0;
let listingSyncPromise: Promise<void> | null = null;
let lastMarketplaceV2SyncAt = 0;
let lastMarketplaceV2ListingSyncCount = 0;
let lastOfferSyncCount = 0;
let marketplaceV2SyncPromise: Promise<void> | null = null;
type ListingSnapshot = {
  listingId: string;
  amountRaw: string;
  standard: string;
  expiresAtRaw: string;
  active: boolean;
};
let listingSnapshotCache = new Map<string, ListingSnapshot>();

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

function tokenPresentationKey(contractAddress: string, tokenId: string): string {
  return `${contractAddress.toLowerCase()}:${tokenId}`;
}

function sanitizeDraftText(value: string | null | undefined, max = 280): string | null {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function sanitizeMintedAmountRaw(value: string | null | undefined): string | null {
  const trimmed = String(value || "").trim();
  return /^[1-9][0-9]*$/.test(trimmed) ? trimmed : null;
}

async function readTokenPresentationRecords(): Promise<TokenPresentationRecord[]> {
  try {
    const raw = await readFile(TOKEN_PRESENTATION_FILE, "utf8");
    const parsed = JSON.parse(raw) as TokenPresentationRecord[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && isAddress(String(item.contractAddress || "").toLowerCase()) && String(item.tokenId || "").trim())
      .map((item) => ({
        contractAddress: String(item.contractAddress).trim().toLowerCase(),
        tokenId: String(item.tokenId).trim(),
        draftName: sanitizeDraftText(item.draftName, 160),
        draftDescription: sanitizeDraftText(item.draftDescription, 1200),
        mintedAmountRaw: sanitizeMintedAmountRaw(item.mintedAmountRaw),
        updatedAt: item.updatedAt || new Date().toISOString()
      }));
  } catch {
    return [];
  }
}

async function writeTokenPresentationRecords(records: TokenPresentationRecord[]): Promise<void> {
  await mkdir(path.dirname(TOKEN_PRESENTATION_FILE), { recursive: true });
  await writeFile(TOKEN_PRESENTATION_FILE, JSON.stringify(records, null, 2), "utf8");
}

async function readTokenPresentationIndex(): Promise<Map<string, TokenPresentationRecord>> {
  const records = await readTokenPresentationRecords();
  return new Map(records.map((item) => [tokenPresentationKey(item.contractAddress, item.tokenId), item]));
}

async function upsertTokenPresentationRecord(payload: {
  contractAddress: string;
  tokenId: string;
  draftName?: string | null;
  draftDescription?: string | null;
  mintedAmountRaw?: string | null;
}): Promise<void> {
  const contractAddress = String(payload.contractAddress || "").trim().toLowerCase();
  const tokenId = String(payload.tokenId || "").trim();
  if (!isAddress(contractAddress) || !tokenId) return;

  const draftName = sanitizeDraftText(payload.draftName, 160);
  const draftDescription = sanitizeDraftText(payload.draftDescription, 1200);
  const mintedAmountRaw = sanitizeMintedAmountRaw(payload.mintedAmountRaw);
  if (!draftName && !draftDescription && !mintedAmountRaw) return;

  const current = await readTokenPresentationRecords();
  const key = tokenPresentationKey(contractAddress, tokenId);
  const existing = current.find((item) => tokenPresentationKey(item.contractAddress, item.tokenId) === key);
  const nextRecord: TokenPresentationRecord = {
    contractAddress,
    tokenId,
    draftName: draftName ?? existing?.draftName ?? null,
    draftDescription: draftDescription ?? existing?.draftDescription ?? null,
    mintedAmountRaw: mintedAmountRaw ?? existing?.mintedAmountRaw ?? null,
    updatedAt: new Date().toISOString()
  };
  const next = [nextRecord, ...current.filter((item) => tokenPresentationKey(item.contractAddress, item.tokenId) !== key)];
  await writeTokenPresentationRecords(next);
}

function withTokenPresentation<T extends { tokenId: string; [key: string]: unknown }>(
  token: T,
  contractAddress: string | null | undefined,
  presentationIndex?: Map<string, TokenPresentationRecord>
): T & {
  draftName?: string | null;
  draftDescription?: string | null;
  mintedAmountRaw?: string | null;
} {
  const normalizedContract = String(contractAddress || "").trim().toLowerCase();
  if (!presentationIndex || !isAddress(normalizedContract)) return token;
  const record = presentationIndex.get(tokenPresentationKey(normalizedContract, token.tokenId));
  if (!record) return token;
  const currentDraftName = sanitizeDraftText((token as { draftName?: string | null }).draftName, 160);
  const currentDraftDescription = sanitizeDraftText((token as { draftDescription?: string | null }).draftDescription, 1200);
  const currentMintedAmountRaw = sanitizeMintedAmountRaw((token as { mintedAmountRaw?: string | null }).mintedAmountRaw);
  return {
    ...token,
    draftName: currentDraftName ?? record.draftName,
    draftDescription: currentDraftDescription ?? record.draftDescription,
    mintedAmountRaw: currentMintedAmountRaw ?? record.mintedAmountRaw
  };
}

function tokenPresentationSelect(enabled: boolean): Record<string, true> {
  return enabled
    ? {
        draftName: true,
        draftDescription: true,
        mintedAmountRaw: true
      }
    : {};
}

function listingV2Select(enabled: boolean): Record<string, true> {
  return enabled
    ? {
        marketplaceVersion: true,
        amountRaw: true,
        standard: true,
        expiresAtRaw: true,
        buyerAddress: true,
        txHash: true,
        cancelledAt: true,
        soldAt: true,
        lastSyncedAt: true
      }
    : {};
}

function tokenListingSelect(enabled: boolean): Record<string, true> {
  return {
    listingId: true,
    sellerAddress: true,
    paymentToken: true,
    priceRaw: true,
    active: true,
    createdAt: true,
    updatedAt: true,
    ...(enabled
      ? {
          marketplaceVersion: true,
          amountRaw: true,
          standard: true,
          expiresAtRaw: true,
          lastSyncedAt: true
        }
      : {})
  };
}

function normalizePublicListingId(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.startsWith("v2:") ? raw.slice(3) : raw;
}

function getMarketplaceAddressForVersion(
  config: RequestHandlerConfig,
  marketplaceVersion: string | null | undefined
): string | null {
  return String(marketplaceVersion || "v1").toLowerCase() === "v2"
    ? config.marketplaceV2Address || null
    : config.marketplaceAddress || null;
}

function pickPrimaryActiveListing(rows: any[] | null | undefined): any | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return [...rows].sort((a, b) => {
    const aVersion = String(a?.marketplaceVersion || "v1").toLowerCase();
    const bVersion = String(b?.marketplaceVersion || "v1").toLowerCase();
    if (aVersion !== bVersion) {
      if (aVersion === "v2") return -1;
      if (bVersion === "v2") return 1;
    }

    const aUpdated = new Date(a?.updatedAt || 0).getTime();
    const bUpdated = new Date(b?.updatedAt || 0).getTime();
    if (aUpdated !== bUpdated) {
      return bUpdated - aUpdated;
    }

    const aCreated = new Date(a?.createdAt || 0).getTime();
    const bCreated = new Date(b?.createdAt || 0).getTime();
    if (aCreated !== bCreated) {
      return bCreated - aCreated;
    }

    const aId = Number.parseInt(normalizePublicListingId(a?.listingId), 10) || 0;
    const bId = Number.parseInt(normalizePublicListingId(b?.listingId), 10) || 0;
    return bId - aId;
  })[0] || null;
}

function toActiveListingApiShape(item: any, config: RequestHandlerConfig) {
  if (!item) return null;
  const listingRecordId = String(item.listingId || "").trim();
  const listingId = normalizePublicListingId(listingRecordId);
  const marketplaceVersion = String(item.marketplaceVersion || (listingRecordId.startsWith("v2:") ? "v2" : "v1")).toLowerCase();
  return {
    listingId,
    listingRecordId: listingRecordId || listingId,
    marketplaceVersion,
    marketplaceAddress: getMarketplaceAddressForVersion(config, marketplaceVersion),
    sellerAddress: item.sellerAddress,
    paymentToken: item.paymentToken,
    priceRaw: item.priceRaw,
    amountRaw: item.amountRaw || null,
    standard: item.standard || null,
    expiresAtRaw: item.expiresAtRaw || null,
    active: item.active,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    lastSyncedAt: item.lastSyncedAt || item.updatedAt || null
  };
}

function toNormalizedOptionalText(value: string | null | undefined): string | null {
  const normalized = String(value || "").trim();
  return normalized ? normalized : null;
}

function toBigIntOrZero(value: unknown): bigint {
  try {
    return BigInt(String(value ?? "0"));
  } catch {
    return 0n;
  }
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
  const normalized = value.startsWith("v2:") ? value.slice(3) : value;
  const parsed = Number.parseInt(normalized, 10);
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

function getPublicActiveListingWhere(includeListingV2 = true): Record<string, unknown> {
  return {
    active: true,
    ...(includeListingV2 ? { marketplaceVersion: "v1" } : {})
  };
}

function getListingRecordId(version: "v1" | "v2", listingId: string | number): string {
  const normalized = String(listingId);
  return version === "v2" ? `v2:${normalized}` : normalized;
}

function resolveListingRecordId(input: {
  listingRecordId?: string | null;
  listingId?: number | string | null;
  marketplaceVersion?: string | null;
}): string | null {
  const recordId = String(input.listingRecordId || "").trim();
  if (recordId) {
    return recordId;
  }

  const listingIdValue = input.listingId;
  if (listingIdValue === null || listingIdValue === undefined || String(listingIdValue).trim() === "") {
    return null;
  }

  const normalizedId = String(listingIdValue).trim();
  return String(input.marketplaceVersion || "v1").toLowerCase() === "v2"
    ? getListingRecordId("v2", normalizedId)
    : normalizedId;
}

type OfferApiShape = {
  id: string;
  offerId: string;
  chainId: number;
  marketplaceVersion: string;
  collectionAddress: string;
  tokenId: string;
  standard: string;
  currentOwnerAddress: string | null;
  currentOwnerAddresses: string[];
  buyerAddress: string;
  paymentToken: string;
  quantityRaw: string;
  priceRaw: string;
  expiresAtRaw: string;
  status: string;
  active: boolean;
  acceptedByAddress: string | null;
  acceptedSellerAddress: string | null;
  acceptedTxHash: string | null;
  cancelledTxHash: string | null;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt: string;
};

function tokenMarketKey(collectionAddress: string | null | undefined, tokenId: string | null | undefined): string {
  return `${String(collectionAddress || "").trim().toLowerCase()}:${String(tokenId || "").trim()}`;
}

function toOfferApiShape(item: any): OfferApiShape {
  const holdingOwners = Array.isArray(item.token?.holdings)
    ? (item.token.holdings as Array<{ ownerAddress: string | null; quantityRaw?: string | null }>)
        .map((entry) => {
          const ownerAddress = String(entry.ownerAddress || "").trim().toLowerCase();
          return isAddress(ownerAddress) && sanitizeMintedAmountRaw(entry.quantityRaw) ? ownerAddress : null;
        })
        .filter((entry: string | null): entry is string => Boolean(entry))
    : [];
  const currentOwnerAddresses =
    holdingOwners.length > 0
      ? holdingOwners
      : (() => {
          const ownerAddress = String(item.token?.ownerAddress || "").trim().toLowerCase();
          return isAddress(ownerAddress) ? [ownerAddress] : [];
        })();
  return {
    id: item.id,
    offerId: item.offerId,
    chainId: item.chainId,
    marketplaceVersion: item.marketplaceVersion || "v2",
    collectionAddress: item.collectionAddress,
    tokenId: item.tokenId,
    standard: String(item.standard || item.token?.collection?.standard || "").trim() || "UNKNOWN",
    currentOwnerAddress: currentOwnerAddresses[0] || null,
    currentOwnerAddresses,
    buyerAddress: item.buyerAddress,
    paymentToken: item.paymentToken,
    quantityRaw: item.quantityRaw,
    priceRaw: item.priceRaw,
    expiresAtRaw: item.expiresAtRaw,
    status: item.status,
    active: Boolean(item.active),
    acceptedByAddress: item.acceptedByAddress || null,
    acceptedSellerAddress: item.acceptedSellerAddress || null,
    acceptedTxHash: item.acceptedTxHash || null,
    cancelledTxHash: item.cancelledTxHash || null,
    createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
    updatedAt: item.updatedAt instanceof Date ? item.updatedAt.toISOString() : item.updatedAt,
    lastSyncedAt: item.lastSyncedAt instanceof Date ? item.lastSyncedAt.toISOString() : item.lastSyncedAt
  };
}

async function readOfferRows(
  deps: IndexerDeps,
  options?: {
    where?: Record<string, unknown>;
    take?: number;
    skip?: number;
    orderBy?: Array<Record<string, "asc" | "desc">>;
  }
): Promise<any[]> {
  if (!(await hasOfferTable(deps))) return [];
  const offerDelegate = (deps.prisma as any).offer;
  if (!offerDelegate || typeof offerDelegate.findMany !== "function") {
    return [];
  }
  try {
    const includeTokenHoldings = await hasTokenHoldingTable(deps);
    return await offerDelegate.findMany({
      where: options?.where || {},
      take: options?.take,
      skip: options?.skip,
      orderBy: options?.orderBy || [{ updatedAt: "desc" }, { createdAt: "desc" }],
      include: {
        token: {
          select: {
            ownerAddress: true,
            ...(includeTokenHoldings
              ? {
                  holdings: {
                    select: {
                      ownerAddress: true,
                      quantityRaw: true
                    }
                  }
                }
              : {}),
            collection: {
              select: {
                standard: true
              }
            }
          }
        }
      }
    });
  } catch {
    return [];
  }
}

async function countOffers(deps: IndexerDeps, where?: Record<string, unknown>): Promise<number> {
  if (!(await hasOfferTable(deps))) return 0;
  const offerDelegate = (deps.prisma as any).offer;
  if (!offerDelegate || typeof offerDelegate.count !== "function") {
    return 0;
  }
  try {
    return await offerDelegate.count({ where: where || {} });
  } catch {
    return 0;
  }
}

async function attachOfferSummaries(
  items: Array<{
    tokenId: string;
    collection?: { contractAddress: string } | null;
    bestOffer?: OfferApiShape | null;
    offerCount?: number;
  }>,
  deps: IndexerDeps
): Promise<void> {
  if (items.length === 0) return;

  const tokenFilters = items
    .map((item) => {
      const contractAddress = String(item.collection?.contractAddress || "").trim().toLowerCase();
      return isAddress(contractAddress) && item.tokenId
        ? { collectionAddress: contractAddress, tokenId: item.tokenId }
        : null;
    })
    .filter((item): item is { collectionAddress: string; tokenId: string } => Boolean(item));
  if (tokenFilters.length === 0) {
    for (const item of items) {
      item.bestOffer = null;
      item.offerCount = 0;
    }
    return;
  }

  const rows = await readOfferRows(deps, {
    where: {
      active: true,
      OR: tokenFilters
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
  });

  const bestOfferByToken = new Map<string, OfferApiShape>();
  const bestOfferValueByToken = new Map<string, bigint>();
  const offerCountByToken = new Map<string, number>();
  for (const row of rows) {
    const key = tokenMarketKey(row.collectionAddress, row.tokenId);
    offerCountByToken.set(key, (offerCountByToken.get(key) || 0) + 1);
    const rowValue = toBigIntOrZero(row.priceRaw);
    const existingValue = bestOfferValueByToken.get(key);
    if (existingValue === undefined || rowValue > existingValue) {
      bestOfferValueByToken.set(key, rowValue);
      bestOfferByToken.set(key, toOfferApiShape(row));
    }
  }

  for (const item of items) {
    const key = tokenMarketKey(item.collection?.contractAddress, item.tokenId);
    item.bestOffer = bestOfferByToken.get(key) || null;
    item.offerCount = offerCountByToken.get(key) || 0;
  }
}

function toTokenApiShape(
  item: any,
  config: RequestHandlerConfig,
  presentationIndex?: Map<string, TokenPresentationRecord>
) {
  return withTokenPresentation({
    id: item.id,
    tokenId: item.tokenId,
    creatorAddress: item.creatorAddress,
    ownerAddress: item.ownerAddress,
    mintTxHash: item.mintTxHash || null,
    draftName: item.draftName || null,
    draftDescription: item.draftDescription || null,
    mintedAmountRaw: item.mintedAmountRaw || null,
    metadataCid: item.metadataCid,
    metadataUrl: buildGatewayUrl(item.metadataCid),
    mediaCid: item.mediaCid,
    mediaUrl: buildGatewayUrl(item.mediaCid),
    immutable: item.immutable,
    mintedAt: item.mintedAt,
    bestOffer: null,
    offerCount: 0,
    activeListing: toActiveListingApiShape(pickPrimaryActiveListing(item.listings), config)
  }, item.collection?.contractAddress, presentationIndex);
}

function resolveOwnedTokenHeldAmountRaw(item: any, ownerAddress: string): string | null {
  const normalizedOwner = String(ownerAddress || "").trim().toLowerCase();
  if (!isAddress(normalizedOwner)) return null;

  const holdingQuantity = Array.isArray(item.holdings)
    ? sanitizeMintedAmountRaw(
        (item.holdings as Array<{ ownerAddress?: string | null; quantityRaw?: string | null }>)
          .find((entry) => String(entry.ownerAddress || "").trim().toLowerCase() === normalizedOwner)
          ?.quantityRaw
      )
    : null;
  if (holdingQuantity) {
    return holdingQuantity;
  }

  const tokenOwnerAddress = String(item.ownerAddress || "").trim().toLowerCase();
  if (!isAddress(tokenOwnerAddress) || tokenOwnerAddress !== normalizedOwner) {
    return null;
  }

  if (String(item.collection?.standard || "").trim().toUpperCase() === "ERC721") {
    return "1";
  }

  return sanitizeMintedAmountRaw(item.mintedAmountRaw) || "1";
}

function getOwnerScopedActiveListings(item: any, ownerAddress: string): any[] {
  const normalizedOwner = String(ownerAddress || "").trim().toLowerCase();
  if (!isAddress(normalizedOwner) || !Array.isArray(item?.listings)) {
    return [];
  }

  return (item.listings as any[]).filter((listing) => {
    if (!listing || listing.active === false) return false;
    const sellerAddress = String(listing.sellerAddress || "").trim().toLowerCase();
    return isAddress(sellerAddress) && sellerAddress === normalizedOwner;
  });
}

function getOwnerScopedListingAvailability(
  item: any,
  ownerAddress: string
): { activeListing: any | null; reservedAmountRaw: string | null; availableAmountRaw: string | null } {
  const standard = String(item?.collection?.standard || "").trim().toUpperCase();
  const heldAmountRaw = resolveOwnedTokenHeldAmountRaw(item, ownerAddress);
  const heldAmount = heldAmountRaw ? BigInt(heldAmountRaw) : null;
  const ownerListings = getOwnerScopedActiveListings(item, ownerAddress);
  const activeListing = pickPrimaryActiveListing(ownerListings);

  if (standard === "ERC721") {
    const reservedAmountRaw = activeListing ? "1" : "0";
    return {
      activeListing,
      reservedAmountRaw,
      availableAmountRaw: heldAmount === null ? null : activeListing ? "0" : heldAmount.toString()
    };
  }

  if (standard !== "ERC1155") {
    return {
      activeListing,
      reservedAmountRaw: null,
      availableAmountRaw: heldAmountRaw
    };
  }

  if (ownerListings.length === 0) {
    return {
      activeListing,
      reservedAmountRaw: "0",
      availableAmountRaw: heldAmountRaw
    };
  }

  let reservedAmount = 0n;
  for (const listing of ownerListings) {
    const amountRaw = sanitizeMintedAmountRaw(listing?.amountRaw);
    if (!amountRaw) {
      return {
        activeListing,
        reservedAmountRaw: null,
        availableAmountRaw: null
      };
    }
    reservedAmount += BigInt(amountRaw);
  }

  return {
    activeListing,
    reservedAmountRaw: reservedAmount.toString(),
    availableAmountRaw: heldAmount === null ? null : (heldAmount > reservedAmount ? heldAmount - reservedAmount : 0n).toString()
  };
}

function toOwnerHoldingApiShape(
  item: any,
  ownerAddress: string,
  config: RequestHandlerConfig,
  presentationIndex?: Map<string, TokenPresentationRecord>
) {
  const normalizedOwner = String(ownerAddress || "").trim().toLowerCase();
  const { activeListing, reservedAmountRaw, availableAmountRaw } = getOwnerScopedListingAvailability(item, normalizedOwner);
  return withTokenPresentation({
    id: item.id,
    tokenId: item.tokenId,
    creatorAddress: item.creatorAddress,
    ownerAddress: normalizedOwner,
    heldAmountRaw: resolveOwnedTokenHeldAmountRaw(item, normalizedOwner),
    reservedAmountRaw,
    availableAmountRaw,
    mintTxHash: item.mintTxHash || null,
    draftName: item.draftName || null,
    draftDescription: item.draftDescription || null,
    mintedAmountRaw: item.mintedAmountRaw || null,
    metadataCid: item.metadataCid,
    metadataUrl: buildGatewayUrl(item.metadataCid),
    mediaCid: item.mediaCid,
    mediaUrl: buildGatewayUrl(item.mediaCid),
    immutable: item.immutable,
    mintedAt: item.mintedAt,
    bestOffer: null,
    offerCount: 0,
    activeListing: toActiveListingApiShape(activeListing, config),
    collection: item.collection
      ? {
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
      : null
  }, item.collection?.contractAddress, presentationIndex);
}

function toListingApiShape(
  item: any,
  config: RequestHandlerConfig,
  presentationIndex?: Map<string, TokenPresentationRecord>
) {
  const token = item.token || null;
  const collection = token?.collection || null;
  const snapshot = listingSnapshotCache.get(String(item.listingId || ""));
  const listingRecordId = String(item.listingId || "");
  const listingId = normalizePublicListingId(listingRecordId);
  const marketplaceVersion = String(item.marketplaceVersion || (listingRecordId.startsWith("v2:") ? "v2" : "v1")).toLowerCase();

  return {
    id: Number.parseInt(listingId, 10) || 0,
    listingId,
    listingRecordId,
    marketplaceVersion,
    marketplaceAddress: getMarketplaceAddressForVersion(config, marketplaceVersion),
    sellerAddress: item.sellerAddress,
    collectionAddress: item.collectionAddress,
    tokenId: item.tokenId,
    amountRaw: item.amountRaw || snapshot?.amountRaw || "1",
    standard: item.standard || snapshot?.standard || collection?.standard || "UNKNOWN",
    paymentToken: item.paymentToken,
    priceRaw: item.priceRaw,
    expiresAtRaw: item.expiresAtRaw || snapshot?.expiresAtRaw || "0",
    active: item.active,
    buyerAddress: item.buyerAddress || null,
    txHash: item.txHash || null,
    cancelledAt: item.cancelledAt || null,
    soldAt: item.soldAt || null,
    lastSyncedAt: item.lastSyncedAt || item.updatedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    token: token
      ? withTokenPresentation({
          id: token.id,
          tokenId: item.tokenId,
          creatorAddress: token.creatorAddress,
          ownerAddress: token.ownerAddress,
          mintTxHash: token.mintTxHash || null,
          draftName: token.draftName || null,
          draftDescription: token.draftDescription || null,
          mintedAmountRaw: token.mintedAmountRaw || null,
          metadataCid: token.metadataCid,
          metadataUrl: buildGatewayUrl(token.metadataCid),
          mediaCid: token.mediaCid,
          mediaUrl: buildGatewayUrl(token.mediaCid),
          immutable: token.immutable,
          mintedAt: token.mintedAt,
          bestOffer: null,
          offerCount: 0,
          activeListing: toActiveListingApiShape(pickPrimaryActiveListing(token.listings), config),
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
        }, collection?.contractAddress, presentationIndex)
      : null
  };
}

const schemaAvailabilityCache = new Map<string, boolean>();

async function hasSchemaTable(deps: IndexerDeps, tableName: string): Promise<boolean> {
  const cacheKey = `table:${tableName}`;
  if (schemaAvailabilityCache.has(cacheKey)) {
    return Boolean(schemaAvailabilityCache.get(cacheKey));
  }

  const prismaAny = deps.prisma as any;
  if (typeof prismaAny.$queryRawUnsafe !== "function") {
    schemaAvailabilityCache.set(cacheKey, false);
    return false;
  }

  try {
    const rows = (await prismaAny.$queryRawUnsafe(`
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = '${tableName}'
      LIMIT 1
    `)) as Array<unknown>;
    const available = rows.length > 0;
    schemaAvailabilityCache.set(cacheKey, available);
    return available;
  } catch {
    schemaAvailabilityCache.set(cacheKey, false);
    return false;
  }
}

async function hasSchemaColumn(deps: IndexerDeps, tableName: string, columnName: string): Promise<boolean> {
  const cacheKey = `column:${tableName}:${columnName}`;
  if (schemaAvailabilityCache.has(cacheKey)) {
    return Boolean(schemaAvailabilityCache.get(cacheKey));
  }

  const prismaAny = deps.prisma as any;
  if (typeof prismaAny.$queryRawUnsafe !== "function") {
    schemaAvailabilityCache.set(cacheKey, false);
    return false;
  }

  try {
    const rows = (await prismaAny.$queryRawUnsafe(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = '${tableName}'
        AND column_name = '${columnName}'
      LIMIT 1
    `)) as Array<unknown>;
    const available = rows.length > 0;
    schemaAvailabilityCache.set(cacheKey, available);
    return available;
  } catch {
    schemaAvailabilityCache.set(cacheKey, false);
    return false;
  }
}

async function hasMintTxHashColumn(deps: IndexerDeps): Promise<boolean> {
  return hasSchemaColumn(deps, "Token", "mintTxHash");
}

async function hasTokenPresentationColumns(deps: IndexerDeps): Promise<boolean> {
  const [draftName, draftDescription, mintedAmountRaw] = await Promise.all([
    hasSchemaColumn(deps, "Token", "draftName"),
    hasSchemaColumn(deps, "Token", "draftDescription"),
    hasSchemaColumn(deps, "Token", "mintedAmountRaw")
  ]);
  return draftName && draftDescription && mintedAmountRaw;
}

async function hasListingV2Columns(deps: IndexerDeps): Promise<boolean> {
  const requiredColumns = [
    "marketplaceVersion",
    "amountRaw",
    "standard",
    "expiresAtRaw",
    "lastSyncedAt",
    "cancelledAt",
    "soldAt",
    "buyerAddress",
    "txHash"
  ];
  const availability = await Promise.all(requiredColumns.map((column) => hasSchemaColumn(deps, "Listing", column)));
  return availability.every(Boolean);
}

async function hasOfferTable(deps: IndexerDeps): Promise<boolean> {
  return hasSchemaTable(deps, "Offer");
}

async function hasTokenHoldingTable(deps: IndexerDeps): Promise<boolean> {
  return hasSchemaTable(deps, "TokenHolding");
}

async function syncIndexedTokenHolding(
  deps: IndexerDeps,
  tokenRefId: string,
  ownerAddress: string,
  quantityRaw: string | null | undefined,
  standard: string
): Promise<void> {
  if (!(await hasTokenHoldingTable(deps))) return;

  const tokenHoldingDelegate = (deps.prisma as any).tokenHolding;
  if (!tokenHoldingDelegate || typeof tokenHoldingDelegate.upsert !== "function") {
    return;
  }

  const normalizedOwner = String(ownerAddress || "").trim().toLowerCase();
  const normalizedQuantity = sanitizeMintedAmountRaw(quantityRaw);
  if (!tokenRefId || !isAddress(normalizedOwner)) return;

  if (String(standard || "").toUpperCase() === "ERC721") {
    try {
      if (typeof tokenHoldingDelegate.deleteMany === "function") {
        await tokenHoldingDelegate.deleteMany({
          where: {
            tokenId: tokenRefId,
            ownerAddress: { not: normalizedOwner }
          }
        });
      }
      await tokenHoldingDelegate.upsert({
        where: {
          tokenId_ownerAddress: {
            tokenId: tokenRefId,
            ownerAddress: normalizedOwner
          }
        },
        update: {
          quantityRaw: "1"
        },
        create: {
          tokenId: tokenRefId,
          ownerAddress: normalizedOwner,
          quantityRaw: "1"
        }
      });
    } catch {
      // Ignore holding sync failures so token metadata sync can still succeed.
    }
    return;
  }

  try {
    if (!normalizedQuantity) {
      if (typeof tokenHoldingDelegate.deleteMany === "function") {
        await tokenHoldingDelegate.deleteMany({
          where: {
            tokenId: tokenRefId,
            ownerAddress: normalizedOwner
          }
        });
      }
      return;
    }

    await tokenHoldingDelegate.upsert({
      where: {
        tokenId_ownerAddress: {
          tokenId: tokenRefId,
          ownerAddress: normalizedOwner
        }
      },
      update: {
        quantityRaw: normalizedQuantity
      },
      create: {
        tokenId: tokenRefId,
        ownerAddress: normalizedOwner,
        quantityRaw: normalizedQuantity
      }
    });
  } catch {
    // Ignore holding sync failures so token metadata sync can still succeed.
  }
}

async function clearIndexedCollectionHoldingsForOwner(
  deps: IndexerDeps,
  contractAddress: string,
  ownerAddress: string,
  retainedTokenIds: Set<string>
): Promise<void> {
  if (!(await hasTokenHoldingTable(deps))) return;

  const tokenHoldingDelegate = (deps.prisma as any).tokenHolding;
  const tokenDelegate = (deps.prisma.token as any);
  if (!tokenHoldingDelegate || typeof tokenHoldingDelegate.deleteMany !== "function" || !tokenDelegate || typeof tokenDelegate.findMany !== "function") {
    return;
  }

  try {
    const collectionTokens = await tokenDelegate.findMany({
      where: {
        collection: {
          is: {
            contractAddress
          }
        }
      },
      select: {
        id: true,
        tokenId: true
      }
    });

    const staleTokenRefIds = (collectionTokens as Array<{ id: string; tokenId: string }>)
      .filter((item) => !retainedTokenIds.has(item.tokenId))
      .map((item) => item.id);

    if (staleTokenRefIds.length === 0) return;

    await tokenHoldingDelegate.deleteMany({
      where: {
        ownerAddress,
        tokenId: { in: staleTokenRefIds }
      }
    });
  } catch {
    // Ignore pruning failures. The next owner sync can correct stale holding rows.
  }
}

async function applyAcceptedOfferOwnership(
  deps: IndexerDeps,
  tokenRefId: string | null | undefined,
  params: {
    buyerAddress: string;
    sellerAddress: string;
    quantityRaw: string;
    standard: string;
  }
): Promise<void> {
  if (!tokenRefId) return;

  const tokenDelegate = (deps.prisma.token as any);
  if (!tokenDelegate || typeof tokenDelegate.update !== "function") {
    return;
  }

  const buyerAddress = String(params.buyerAddress || "").trim().toLowerCase();
  const sellerAddress = String(params.sellerAddress || "").trim().toLowerCase();
  const standard = String(params.standard || "").trim().toUpperCase();
  const quantityRaw = sanitizeMintedAmountRaw(params.quantityRaw);
  if (!isAddress(buyerAddress) || !isAddress(sellerAddress)) return;

  try {
    await tokenDelegate.update({
      where: { id: tokenRefId },
      data: {
        ownerAddress: buyerAddress
      }
    });
  } catch {
    // Ignore ownership mirror failures if the token row is not writable in this runtime.
  }

  if (standard === "ERC721") {
    await syncIndexedTokenHolding(deps, tokenRefId, buyerAddress, "1", "ERC721");
    return;
  }

  if (!(await hasTokenHoldingTable(deps)) || !quantityRaw) return;

  const tokenHoldingDelegate = (deps.prisma as any).tokenHolding;
  if (!tokenHoldingDelegate || typeof tokenHoldingDelegate.findUnique !== "function" || typeof tokenHoldingDelegate.upsert !== "function") {
    return;
  }

  try {
    const transferAmount = BigInt(quantityRaw);
    const [sellerHolding, buyerHolding] = await Promise.all([
      tokenHoldingDelegate.findUnique({
        where: {
          tokenId_ownerAddress: {
            tokenId: tokenRefId,
            ownerAddress: sellerAddress
          }
        }
      }),
      tokenHoldingDelegate.findUnique({
        where: {
          tokenId_ownerAddress: {
            tokenId: tokenRefId,
            ownerAddress: buyerAddress
          }
        }
      })
    ]);

    const nextSellerQuantity = sellerHolding?.quantityRaw ? BigInt(String(sellerHolding.quantityRaw)) - transferAmount : 0n;
    if (nextSellerQuantity > 0n) {
      await syncIndexedTokenHolding(deps, tokenRefId, sellerAddress, nextSellerQuantity.toString(), "ERC1155");
    } else {
      await syncIndexedTokenHolding(deps, tokenRefId, sellerAddress, null, "ERC1155");
    }

    const nextBuyerQuantity = (buyerHolding?.quantityRaw ? BigInt(String(buyerHolding.quantityRaw)) : 0n) + transferAmount;
    await syncIndexedTokenHolding(deps, tokenRefId, buyerAddress, nextBuyerQuantity.toString(), "ERC1155");
  } catch {
    // Ignore settlement-holding failures. A later owner backfill can correct them.
  }
}

async function buildOwnedTokenWhere(deps: IndexerDeps, ownerAddress: string): Promise<Record<string, unknown>> {
  const normalizedOwner = String(ownerAddress || "").trim().toLowerCase();
  if (!(await hasTokenHoldingTable(deps))) {
    return { ownerAddress: normalizedOwner };
  }
  return {
    OR: [
      { ownerAddress: normalizedOwner },
      {
        holdings: {
          some: {
            ownerAddress: normalizedOwner
          }
        }
      }
    ]
  };
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

async function findTokenRefIdForAsset(
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
      const includeListingV2 = await hasListingV2Columns(deps);

      const nextListingId = (await client.readContract({
        address: config.marketplaceAddress as `0x${string}`,
        abi: marketplaceReadAbi,
        functionName: "nextListingId"
      })) as bigint;

      const activeListingIds = new Set<string>();
      const currentUnix = BigInt(Math.floor(Date.now() / 1000));
      const nextListingSnapshots = new Map<string, ListingSnapshot>();

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
            const syncedAt = new Date();
            const amountRaw = row[3].toString();
            const standard = String(row[4] || "UNKNOWN").trim().toUpperCase() || "UNKNOWN";
            const expiresAtRaw = row[7].toString();
            nextListingSnapshots.set(listingId, {
              listingId,
              amountRaw,
              standard,
              expiresAtRaw,
              active: Boolean(row[8])
            });
            const isActive = row[8] && row[7] > currentUnix;
            if (!isActive) return;

            activeListingIds.add(listingId);
            const collectionAddress = row[1].toLowerCase();
            const tokenId = row[2].toString();
            const tokenRefId = await findTokenRefIdForAsset(collectionAddress, tokenId, deps);
            const baseListingData = {
              chainId: config.chainId,
              collectionAddress,
              tokenId,
              sellerAddress: row[0].toLowerCase(),
              paymentToken: row[5].toLowerCase(),
              priceRaw: row[6].toString(),
              active: true,
              tokenRefId
            };
            const listingV2Data = includeListingV2
              ? {
                  marketplaceVersion: "v1",
                  amountRaw,
                  standard,
                  expiresAtRaw,
                  lastSyncedAt: syncedAt,
                  buyerAddress: null,
                  cancelledAt: null,
                  soldAt: null,
                  txHash: null
                }
              : {};

            await deps.prisma.listing.upsert({
              where: { listingId },
              update: {
                ...baseListingData,
                ...listingV2Data
              },
              create: {
                listingId,
                ...baseListingData,
                ...listingV2Data
              }
            });
          })
        );
      }

      await deps.prisma.listing.updateMany({
        where: {
          chainId: config.chainId,
          active: true,
          ...(includeListingV2 ? { marketplaceVersion: "v1" } : {}),
          ...(activeListingIds.size > 0 ? { listingId: { notIn: Array.from(activeListingIds) } } : {})
        },
        data: {
          active: false,
          ...(includeListingV2 ? { lastSyncedAt: new Date() } : {})
        }
      });

      listingSnapshotCache = nextListingSnapshots;
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

async function syncMarketplaceV2Listings(
  deps: IndexerDeps,
  config: RequestHandlerConfig,
  client: ReturnType<typeof createPublicClient>
): Promise<number> {
  if (!config.marketplaceV2Address) return 0;
  if (!(await hasListingV2Columns(deps))) return 0;

  const nextListingId = (await client.readContract({
    address: config.marketplaceV2Address as `0x${string}`,
    abi: marketplaceReadAbi,
    functionName: "nextListingId"
  })) as bigint;

  const activeListingIds = new Set<string>();
  const currentUnix = BigInt(Math.floor(Date.now() / 1000));

  for (let offset = 0; offset < Number(nextListingId); offset += LISTING_SYNC_BATCH_SIZE) {
    const batchIds: number[] = [];
    for (let id = offset; id < Math.min(Number(nextListingId), offset + LISTING_SYNC_BATCH_SIZE); id += 1) {
      batchIds.push(id);
    }

    const rows = (await Promise.all(
      batchIds.map((id) =>
        client.readContract({
          address: config.marketplaceV2Address as `0x${string}`,
          abi: marketplaceReadAbi,
          functionName: "listings",
          args: [BigInt(id)]
        })
      )
    )) as readonly (readonly [`0x${string}`, `0x${string}`, bigint, bigint, string, `0x${string}`, bigint, bigint, boolean])[];

    await Promise.all(
      rows.map(async (row, index) => {
        const listingId = getListingRecordId("v2", batchIds[index]);
        const syncedAt = new Date();
        const amountRaw = row[3].toString();
        const standard = String(row[4] || "UNKNOWN").trim().toUpperCase() || "UNKNOWN";
        const expiresAtRaw = row[7].toString();
        const isActive = row[8] && row[7] > currentUnix;
        if (isActive) {
          activeListingIds.add(listingId);
        }

        const collectionAddress = row[1].toLowerCase();
        const tokenId = row[2].toString();
        const tokenRefId = await findTokenRefIdForAsset(collectionAddress, tokenId, deps);

        await deps.prisma.listing.upsert({
          where: { listingId },
          update: {
            chainId: config.chainId,
            marketplaceVersion: "v2",
            collectionAddress,
            tokenId,
            sellerAddress: row[0].toLowerCase(),
            amountRaw,
            standard,
            paymentToken: row[5].toLowerCase(),
            priceRaw: row[6].toString(),
            expiresAtRaw,
            active: isActive,
            tokenRefId,
            lastSyncedAt: syncedAt,
            buyerAddress: null,
            cancelledAt: null,
            soldAt: null,
            txHash: null
          },
          create: {
            listingId,
            chainId: config.chainId,
            marketplaceVersion: "v2",
            collectionAddress,
            tokenId,
            sellerAddress: row[0].toLowerCase(),
            amountRaw,
            standard,
            paymentToken: row[5].toLowerCase(),
            priceRaw: row[6].toString(),
            expiresAtRaw,
            active: isActive,
            tokenRefId,
            lastSyncedAt: syncedAt,
            buyerAddress: null,
            cancelledAt: null,
            soldAt: null,
            txHash: null
          }
        });
      })
    );
  }

  await deps.prisma.listing.updateMany({
    where: {
      chainId: config.chainId,
      marketplaceVersion: "v2",
      active: true,
      ...(activeListingIds.size > 0 ? { listingId: { notIn: Array.from(activeListingIds) } } : {})
    },
    data: {
      active: false,
      lastSyncedAt: new Date()
    }
  });

  return activeListingIds.size;
}

async function syncMarketplaceV2Offers(
  deps: IndexerDeps,
  config: RequestHandlerConfig,
  client: ReturnType<typeof createPublicClient>
): Promise<number> {
  if (!config.marketplaceV2Address) return 0;
  if (!(await hasOfferTable(deps))) return 0;

  const offerDelegate = (deps.prisma as any).offer;
  if (!offerDelegate || typeof offerDelegate.upsert !== "function") return 0;

  const nextOfferId = (await client.readContract({
    address: config.marketplaceV2Address as `0x${string}`,
    abi: marketplaceV2ReadAbi,
    functionName: "nextOfferId"
  })) as bigint;

  const [cancelledLogs, acceptedLogs] = await Promise.all([
    getLogsChunked(client, {
      address: config.marketplaceV2Address as `0x${string}`,
      event: marketplaceOfferCancelledEvent,
      fromBlock: 0n
    }),
    getLogsChunked(client, {
      address: config.marketplaceV2Address as `0x${string}`,
      event: marketplaceOfferAcceptedEvent,
      fromBlock: 0n
    })
  ]);

  const cancelledByOfferId = new Map<string, { txHash: string }>();
  for (const logEntry of cancelledLogs) {
    const offerId = logEntry.args.offerId?.toString();
    if (!offerId) continue;
    cancelledByOfferId.set(offerId, { txHash: logEntry.transactionHash });
  }

  const acceptedByOfferId = new Map<string, { sellerAddress: string; buyerAddress: string; quantityRaw: string; txHash: string }>();
  for (const logEntry of acceptedLogs) {
    const offerId = logEntry.args.offerId?.toString();
    const sellerAddress = String(logEntry.args.seller || "").toLowerCase();
    const buyerAddress = String(logEntry.args.buyer || "").toLowerCase();
    const quantityRaw = logEntry.args.quantity?.toString() || "";
    if (!offerId || !isAddress(sellerAddress) || !isAddress(buyerAddress) || !sanitizeMintedAmountRaw(quantityRaw)) continue;
    acceptedByOfferId.set(offerId, {
      sellerAddress,
      buyerAddress,
      quantityRaw,
      txHash: logEntry.transactionHash
    });
  }

  const currentUnix = BigInt(Math.floor(Date.now() / 1000));

  for (let offset = 0; offset < Number(nextOfferId); offset += LISTING_SYNC_BATCH_SIZE) {
    const batchIds: number[] = [];
    for (let id = offset; id < Math.min(Number(nextOfferId), offset + LISTING_SYNC_BATCH_SIZE); id += 1) {
      batchIds.push(id);
    }

    const rows = (await Promise.all(
      batchIds.map((id) =>
        client.readContract({
          address: config.marketplaceV2Address as `0x${string}`,
          abi: marketplaceV2ReadAbi,
          functionName: "offers",
          args: [BigInt(id)]
        })
      )
    )) as readonly (readonly [`0x${string}`, `0x${string}`, bigint, bigint, string, `0x${string}`, bigint, bigint, boolean])[];

    await Promise.all(
      rows.map(async (row, index) => {
        const offerId = String(batchIds[index]);
        const syncedAt = new Date();
        const collectionAddress = row[1].toLowerCase();
        const tokenId = row[2].toString();
        const accepted = acceptedByOfferId.get(offerId);
        const cancelled = cancelledByOfferId.get(offerId);
        const expiresAtRaw = row[7].toString();
        const expired = row[7] <= currentUnix;
        const active = Boolean(row[8]) && !expired && !accepted && !cancelled;
        const status = accepted
          ? "accepted"
          : cancelled
            ? "cancelled"
            : expired
              ? "expired"
              : active
                ? "active"
                : "inactive";
        const tokenRefId = await findTokenRefIdForAsset(collectionAddress, tokenId, deps);
        const previousOffer = typeof offerDelegate.findUnique === "function"
          ? await offerDelegate.findUnique({
              where: { offerId },
              select: { acceptedTxHash: true }
            })
          : null;

        await offerDelegate.upsert({
          where: { offerId },
          update: {
            chainId: config.chainId,
            marketplaceVersion: "v2",
            collectionAddress,
            tokenId,
            buyerAddress: row[0].toLowerCase(),
            paymentToken: row[5].toLowerCase(),
            quantityRaw: row[3].toString(),
            priceRaw: row[6].toString(),
            expiresAtRaw,
            status,
            active,
            acceptedByAddress: accepted?.sellerAddress || null,
            acceptedSellerAddress: accepted?.sellerAddress || null,
            acceptedTxHash: accepted?.txHash || null,
            cancelledTxHash: cancelled?.txHash || null,
            tokenRefId,
            lastSyncedAt: syncedAt
          },
          create: {
            offerId,
            chainId: config.chainId,
            marketplaceVersion: "v2",
            collectionAddress,
            tokenId,
            buyerAddress: row[0].toLowerCase(),
            paymentToken: row[5].toLowerCase(),
            quantityRaw: row[3].toString(),
            priceRaw: row[6].toString(),
            expiresAtRaw,
            status,
            active,
            acceptedByAddress: accepted?.sellerAddress || null,
            acceptedSellerAddress: accepted?.sellerAddress || null,
            acceptedTxHash: accepted?.txHash || null,
            cancelledTxHash: cancelled?.txHash || null,
            tokenRefId,
            lastSyncedAt: syncedAt
          }
        });

        if (accepted?.txHash && accepted.txHash !== previousOffer?.acceptedTxHash) {
          await applyAcceptedOfferOwnership(deps, tokenRefId, {
            buyerAddress: accepted.buyerAddress,
            sellerAddress: accepted.sellerAddress,
            quantityRaw: accepted.quantityRaw,
            standard: String(row[4] || "UNKNOWN")
          });
        }
      })
    );
  }

  return Number(nextOfferId);
}

async function syncMarketplaceV2IfStale(
  deps: IndexerDeps,
  config: RequestHandlerConfig,
  options?: { force?: boolean; includeListings?: boolean; includeOffers?: boolean }
): Promise<void> {
  if (!config.marketplaceV2Address) return;

  const shouldSyncListings =
    options?.includeListings !== false &&
    (!config.marketplaceAddress || config.marketplaceV2Address.toLowerCase() !== config.marketplaceAddress.toLowerCase());
  const shouldSyncOffers = options?.includeOffers !== false;
  if (!shouldSyncListings && !shouldSyncOffers) return;

  const now = Date.now();
  if (marketplaceV2SyncPromise) {
    await marketplaceV2SyncPromise;
    return;
  }
  if (!options?.force && now - lastMarketplaceV2SyncAt < MARKETPLACE_V2_SYNC_TTL_MS) {
    return;
  }

  marketplaceV2SyncPromise = (async () => {
    try {
      const client = createPublicClient({
        transport: http(config.rpcUrl)
      });

      if (shouldSyncListings) {
        lastMarketplaceV2ListingSyncCount = await syncMarketplaceV2Listings(deps, config, client);
      }
      if (shouldSyncOffers) {
        lastOfferSyncCount = await syncMarketplaceV2Offers(deps, config, client);
      }

      lastMarketplaceV2SyncAt = Date.now();
    } catch (err) {
      log.warn({ err }, "marketplace_v2_sync_failed");
    } finally {
      marketplaceV2SyncPromise = null;
    }
  })();

  await marketplaceV2SyncPromise;
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

  const token = await (deps.prisma.token as any).upsert({
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
  const includeListingV2 = await hasListingV2Columns(deps);
  const listingSyncedAt = new Date();
  const listingRecordId = resolveListingRecordId(payload);
  if (!listingRecordId) {
    throw new BadRequestError("Invalid report payload");
  }
  const marketplaceVersion = String(payload.marketplaceVersion || (listingRecordId.startsWith("v2:") ? "v2" : "v1")).toLowerCase() === "v2"
    ? "v2"
    : "v1";

  const listing = await deps.prisma.listing.upsert({
    where: { listingId: listingRecordId },
    update: {
      chainId: config.chainId,
      collectionAddress,
      tokenId: payload.tokenId,
      sellerAddress,
      paymentToken: "0x0000000000000000000000000000000000000000",
      priceRaw: "0",
      tokenRefId: token.id,
      ...(includeListingV2
        ? {
            marketplaceVersion,
            amountRaw: "1",
            standard,
            expiresAtRaw: "0",
            lastSyncedAt: listingSyncedAt
          }
        : {})
    },
    create: {
      listingId: listingRecordId,
      chainId: config.chainId,
      collectionAddress,
      tokenId: payload.tokenId,
      sellerAddress,
      paymentToken: "0x0000000000000000000000000000000000000000",
      priceRaw: "0",
      tokenRefId: token.id,
      ...(includeListingV2
        ? {
            marketplaceVersion,
            amountRaw: "1",
            standard,
            expiresAtRaw: "0",
            lastSyncedAt: listingSyncedAt
          }
        : {})
    }
  });

  return { tokenRefId: token.id, listingRowId: listing.id };
}

async function upsertMintedToken(
  payload: SyncMintedTokenPayload,
  deps: IndexerDeps,
  config: RequestHandlerConfig
): Promise<any> {
  const contractAddress = String(payload.contractAddress || "").trim().toLowerCase();
  const collectionOwnerAddress = String(payload.collectionOwnerAddress || payload.ownerAddress || "").trim().toLowerCase();
  const creatorAddress = String(payload.creatorAddress || "").trim().toLowerCase();
  const ownerAddress = String(payload.ownerAddress || "").trim().toLowerCase();
  const tokenId = String(payload.tokenId || "").trim();
  const standard = String(payload.standard || "ERC721").trim().toUpperCase() === "ERC1155" ? "ERC1155" : "ERC721";
  const metadataCid = String(payload.metadataCid || "").trim();
  const mediaCid = payload.mediaCid?.trim() || null;
  const ensSubname = payload.ensSubname?.trim() || null;
  const mintTxHash = payload.mintTxHash?.trim() || null;
  const draftName = toNormalizedOptionalText(payload.draftName);
  const draftDescription = toNormalizedOptionalText(payload.draftDescription);
  const mintedAmountRaw = toNormalizedOptionalText(payload.mintedAmountRaw);
  const mintedAt = payload.mintedAt?.trim() ? new Date(payload.mintedAt) : new Date();
  const finalizedAt =
    payload.finalizedAt && payload.finalizedAt.trim()
      ? new Date(payload.finalizedAt)
      : null;
  const [includeTokenPresentation, includeListingV2] = await Promise.all([
    hasTokenPresentationColumns(deps),
    hasListingV2Columns(deps)
  ]);

  if (
    (typeof payload.chainId === "number" && payload.chainId !== config.chainId) ||
    !isAddress(contractAddress) ||
    !isAddress(collectionOwnerAddress) ||
    !isAddress(creatorAddress) ||
    !isAddress(ownerAddress) ||
    !tokenId ||
    !metadataCid
  ) {
    throw new BadRequestError("Invalid token sync payload");
  }

  const collection = await deps.prisma.collection.upsert({
    where: { contractAddress },
    update: {
      ownerAddress: collectionOwnerAddress,
      ensSubname: ensSubname || undefined,
      standard,
      isFactoryCreated: payload.isFactoryCreated === true,
      isUpgradeable: payload.isUpgradeable !== false,
      finalizedAt: finalizedAt || undefined
    },
    create: {
      chainId: config.chainId,
      contractAddress,
      ownerAddress: collectionOwnerAddress,
      ensSubname,
      standard,
      isFactoryCreated: payload.isFactoryCreated === true,
      isUpgradeable: payload.isUpgradeable !== false,
      finalizedAt
    }
  });

  const token = await (deps.prisma.token as any).upsert({
    where: {
      collectionId_tokenId: {
        collectionId: collection.id,
        tokenId
      }
    },
    update: {
      creatorAddress,
      ownerAddress,
      mintTxHash,
      ...(includeTokenPresentation
        ? {
            draftName,
            draftDescription,
            mintedAmountRaw
          }
        : {}),
      metadataCid,
      mediaCid,
      immutable: payload.immutable !== false,
      mintedAt
    },
    create: {
      collectionId: collection.id,
      tokenId,
      creatorAddress,
      ownerAddress,
      mintTxHash,
      ...(includeTokenPresentation
        ? {
            draftName,
            draftDescription,
            mintedAmountRaw
          }
        : {}),
      metadataCid,
      mediaCid,
      immutable: payload.immutable !== false,
      mintedAt
    },
    include: {
      collection: true,
      listings: {
        where: { active: true },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        take: includeListingV2 ? 5 : 1,
        select: tokenListingSelect(includeListingV2)
      }
    }
  });

  await syncIndexedTokenHolding(
    deps,
    token.id,
    ownerAddress,
    standard === "ERC1155" ? mintedAmountRaw || "1" : "1",
    standard
  );

  return token;
}

function isRangeTooLargeError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err);
  return msg.includes("block range") || msg.includes("Block range") || msg.includes("-32600");
}

function isRateLimitError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err);
  return msg.includes("429") || msg.toLowerCase().includes("too many requests") || msg.includes("rate limit");
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getLogsChunked(
  client: ReturnType<typeof createPublicClient>,
  params: any,
  initialChunkSize = 2000n
): Promise<any[]> {
  const currentBlock = await client.getBlockNumber();
  const fromBlock: bigint = params.fromBlock ?? 0n;
  const toBlock: bigint = params.toBlock ?? currentBlock;

  const allLogs: any[] = [];
  let chunkSize = initialChunkSize;
  let start = fromBlock;

  while (start <= toBlock) {
    const end = start + chunkSize - 1n > toBlock ? toBlock : start + chunkSize - 1n;
    let retryDelay = 2000;
    let advanced = false;
    while (!advanced) {
      try {
        const chunk = await client.getLogs({ ...params, fromBlock: start, toBlock: end });
        allLogs.push(...(chunk as any[]));
        start = end + 1n;
        advanced = true;
      } catch (err) {
        if (isRateLimitError(err)) {
          await sleep(retryDelay);
          retryDelay = Math.min(retryDelay * 2, 30_000);
        } else if (isRangeTooLargeError(err) && chunkSize > 1n) {
          chunkSize = chunkSize / 2n < 1n ? 1n : chunkSize / 2n;
          break; // restart inner loop with smaller chunk
        } else {
          throw err;
        }
      }
    }
  }

  return allLogs;
}

async function backfillCollectionTokens(
  payload: BackfillCollectionTokensPayload,
  deps: IndexerDeps,
  config: RequestHandlerConfig
): Promise<{ scanned: number; upserted: number; standard: string; ownerAddress: string | null }> {
  const contractAddress = String(payload.contractAddress || "").trim().toLowerCase();
  const requestedOwner = payload.ownerAddress?.trim().toLowerCase() || null;
  if (!isAddress(contractAddress)) {
    throw new BadRequestError("Invalid contractAddress");
  }
  if (requestedOwner && !isAddress(requestedOwner)) {
    throw new BadRequestError("Invalid ownerAddress");
  }

  const existingCollection = await deps.prisma.collection.findUnique({
    where: { contractAddress },
    select: {
      ownerAddress: true,
      ensSubname: true,
      standard: true,
      isFactoryCreated: true,
      isUpgradeable: true,
      finalizedAt: true
    }
  });

  const client = createPublicClient({
    transport: http(config.rpcUrl)
  });

  let chainOwnerAddress: string | null = null;
  try {
    const owner = await client.readContract({
      address: contractAddress as `0x${string}`,
      abi: ownableReadAbi,
      functionName: "owner"
    });
    const normalized = String(owner || "").toLowerCase();
    if (isAddress(normalized)) {
      chainOwnerAddress = normalized;
    }
  } catch {
    chainOwnerAddress = null;
  }

  let standard = String(payload.standard || existingCollection?.standard || "").trim().toUpperCase();
  if (standard !== "ERC721" && standard !== "ERC1155") {
    try {
      const [is721, is1155] = await Promise.all([
        client.readContract({
          address: contractAddress as `0x${string}`,
          abi: erc165ReadAbi,
          functionName: "supportsInterface",
          args: ["0x80ac58cd"]
        }).catch(() => false),
        client.readContract({
          address: contractAddress as `0x${string}`,
          abi: erc165ReadAbi,
          functionName: "supportsInterface",
          args: ["0xd9b67a26"]
        }).catch(() => false)
      ]);
      standard = is721 ? "ERC721" : is1155 ? "ERC1155" : "";
    } catch {
      standard = "";
    }
  }
  if (standard !== "ERC721" && standard !== "ERC1155") {
    throw new BadRequestError("Could not determine collection standard");
  }

  const effectiveOwnerAddress = requestedOwner || chainOwnerAddress || existingCollection?.ownerAddress || null;
  const effectiveIsUpgradeable = payload.isUpgradeable ?? existingCollection?.isUpgradeable ?? true;
  const scanFromBlock = payload.fromBlock != null ? BigInt(payload.fromBlock) : 0n;
  let scanned = 0;
  let upserted = 0;

  if (standard === "ERC721") {
    const logs = await getLogsChunked(client, {
      address: contractAddress as `0x${string}`,
      event: erc721TransferEvent,
      fromBlock: scanFromBlock
    });
    const mintedLogs = logs.filter((log) => String(log.args.from || "").toLowerCase() === ZERO_ADDRESS);
    scanned = mintedLogs.length;

    for (const log of mintedLogs) {
      const tokenId = log.args.tokenId?.toString();
      if (!tokenId) continue;

      let currentOwner = effectiveOwnerAddress;
      try {
        const owner = await client.readContract({
          address: contractAddress as `0x${string}`,
          abi: erc721ReadAbi,
          functionName: "ownerOf",
          args: [BigInt(tokenId)]
        });
        const normalized = String(owner || "").toLowerCase();
        currentOwner = isAddress(normalized) ? normalized : currentOwner;
      } catch {
        currentOwner = currentOwner || null;
      }
      if (!currentOwner) continue;
      if (requestedOwner && currentOwner !== requestedOwner) continue;

      let metadataCid = "";
      try {
        metadataCid = String(
          await client.readContract({
            address: contractAddress as `0x${string}`,
            abi: erc721ReadAbi,
            functionName: "tokenURI",
            args: [BigInt(tokenId)]
          })
        );
      } catch {
        metadataCid = "";
      }
      if (!metadataCid) continue;

      await upsertMintedToken(
        {
          chainId: config.chainId,
          contractAddress,
          collectionOwnerAddress: chainOwnerAddress || currentOwner,
          tokenId,
          creatorAddress: chainOwnerAddress || currentOwner,
          ownerAddress: currentOwner,
          standard,
          isFactoryCreated: payload.isFactoryCreated ?? existingCollection?.isFactoryCreated ?? false,
          isUpgradeable: effectiveIsUpgradeable,
          ensSubname: payload.ensSubname ?? existingCollection?.ensSubname ?? null,
          finalizedAt: existingCollection?.finalizedAt?.toISOString() || null,
          mintTxHash: log.transactionHash,
          metadataCid,
          mediaCid: null,
          immutable: !effectiveIsUpgradeable
        },
        deps,
        config
      );
      upserted += 1;
    }
  } else {
    const targetOwner = effectiveOwnerAddress;
    if (!targetOwner) {
      throw new BadRequestError("ownerAddress is required to backfill ERC1155 collections");
    }

    const singleLogs = await getLogsChunked(client, {
      address: contractAddress as `0x${string}`,
      event: erc1155TransferSingleEvent,
      fromBlock: scanFromBlock
    });
    const batchLogs = await getLogsChunked(client, {
      address: contractAddress as `0x${string}`,
      event: erc1155TransferBatchEvent,
      fromBlock: scanFromBlock
    });

    const tokenIds = new Set<string>();
    const mintTxByTokenId = new Map<string, string>();
    for (const log of singleLogs) {
      if (String(log.args.from || "").toLowerCase() !== ZERO_ADDRESS) continue;
      const tokenId = log.args.id?.toString();
      if (!tokenId) continue;
      tokenIds.add(tokenId);
      if (!mintTxByTokenId.has(tokenId)) {
        mintTxByTokenId.set(tokenId, log.transactionHash);
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

    scanned = tokenIds.size;
    const positiveTokenIds = new Set<string>();
    for (const tokenId of tokenIds) {
      let balance = 0n;
      try {
        balance = BigInt(
          await client.readContract({
            address: contractAddress as `0x${string}`,
            abi: erc1155ReadAbi,
            functionName: "balanceOf",
            args: [targetOwner as `0x${string}`, BigInt(tokenId)]
          })
        );
      } catch {
        balance = 0n;
      }
      if (balance <= 0n) continue;
      positiveTokenIds.add(tokenId);

      let metadataCid = "";
      try {
        metadataCid = String(
          await client.readContract({
            address: contractAddress as `0x${string}`,
            abi: erc1155ReadAbi,
            functionName: "uri",
            args: [BigInt(tokenId)]
          })
        );
      } catch {
        metadataCid = "";
      }
      if (!metadataCid) continue;

      await upsertMintedToken(
        {
          chainId: config.chainId,
          contractAddress,
          collectionOwnerAddress: chainOwnerAddress || targetOwner,
          tokenId,
          creatorAddress: chainOwnerAddress || targetOwner,
          ownerAddress: targetOwner,
          standard,
          isFactoryCreated: payload.isFactoryCreated ?? existingCollection?.isFactoryCreated ?? false,
          isUpgradeable: effectiveIsUpgradeable,
          ensSubname: payload.ensSubname ?? existingCollection?.ensSubname ?? null,
          finalizedAt: existingCollection?.finalizedAt?.toISOString() || null,
          mintTxHash: mintTxByTokenId.get(tokenId) || null,
          mintedAmountRaw: balance.toString(),
          metadataCid,
          mediaCid: null,
          immutable: true
        },
        deps,
        config
      );
      upserted += 1;
    }

    await clearIndexedCollectionHoldingsForOwner(deps, contractAddress, targetOwner, positiveTokenIds);
  }

  return {
    scanned,
    upserted,
    standard,
    ownerAddress: effectiveOwnerAddress
  };
}

async function backfillRegistryCollections(
  deps: IndexerDeps,
  config: RequestHandlerConfig,
  fromBlock = 0n
): Promise<{ discovered: number; scanned: number; upserted: number }> {
  if (!config.registryAddress) {
    throw new BadRequestError("REGISTRY_ADDRESS is not configured");
  }

  const client = createPublicClient({ transport: http(config.rpcUrl) });

  const logs = await getLogsChunked(client, {
    address: config.registryAddress,
    event: creatorRegisteredEvent,
    fromBlock
  });

  // Deduplicate by contractAddress; last registration wins
  const collectionMap = new Map<string, {
    creator: string;
    contractAddress: string;
    ensSubname: string;
    standard: string;
    isNftFactoryCreated: boolean;
  }>();

  for (const logEntry of logs) {
    const addr = String(logEntry.args.contractAddress || "").toLowerCase();
    const creator = String(logEntry.args.creator || "").toLowerCase();
    if (!isAddress(addr) || !isAddress(creator)) continue;
    collectionMap.set(addr, {
      creator,
      contractAddress: addr,
      ensSubname: String(logEntry.args.ensSubname || "").trim(),
      standard: String(logEntry.args.standard || "").trim().toUpperCase(),
      isNftFactoryCreated: Boolean(logEntry.args.isNftFactoryCreated)
    });
  }

  let totalScanned = 0;
  let totalUpserted = 0;

  for (const collection of collectionMap.values()) {
    try {
      const result = await backfillCollectionTokens(
        {
          contractAddress: collection.contractAddress,
          ownerAddress: collection.creator,
          standard: collection.standard as "ERC721" | "ERC1155" | undefined,
          ensSubname: collection.ensSubname || null,
          isFactoryCreated: collection.isNftFactoryCreated,
          fromBlock: Number(fromBlock)
        },
        deps,
        config
      );
      totalScanned += result.scanned;
      totalUpserted += result.upserted;
      log.info(
        { contractAddress: collection.contractAddress, scanned: result.scanned, upserted: result.upserted },
        "Backfilled collection"
      );
    } catch (err) {
      log.warn({ err, contractAddress: collection.contractAddress }, "Skipped collection during registry backfill");
    }
  }

  return { discovered: collectionMap.size, scanned: totalScanned, upserted: totalUpserted };
}

async function listHiddenListings(deps: IndexerDeps): Promise<{ listingIds: number[]; listingRecordIds: string[] }> {
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

  if (hiddenTokenIds.length === 0) {
    return {
      listingIds: [],
      listingRecordIds: []
    };
  }

  const listings = await deps.prisma.listing.findMany({
    where: {
      tokenRefId: { in: hiddenTokenIds },
      active: true
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: { listingId: true }
  });

  const listingRecordIds = listings
    .map((item: { listingId: string }) => String(item.listingId || "").trim())
    .filter(Boolean)
    .sort((a: string, b: string) => a.localeCompare(b));
  const listingIds = listingRecordIds
    .map((listingId) => parseListingId(listingId))
    .filter((id): id is number => Number.isInteger(id) && (id as number) >= 0)
    .sort((a: number, b: number) => a - b);

  return {
    listingIds,
    listingRecordIds
  };
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
    const [mintTxHashColumnAvailable, tokenPresentationColumnsAvailable, listingV2ColumnsAvailable, offerTableAvailable, tokenHoldingTableAvailable] =
      await Promise.all([
        hasMintTxHashColumn(deps),
        hasTokenPresentationColumns(deps),
        hasListingV2Columns(deps),
        hasOfferTable(deps),
        hasTokenHoldingTable(deps)
      ]);
    sendJson(res, 200, {
      ok: true,
      service: "indexer-api",
      schema: {
        mintTxHashColumnAvailable,
        tokenPresentationColumnsAvailable,
        listingV2ColumnsAvailable,
        offerTableAvailable,
        tokenHoldingTableAvailable
      },
      marketplace: {
        configured: Boolean(config.marketplaceAddress),
        syncInProgress: Boolean(listingSyncPromise),
        lastListingSyncAt: lastListingSyncAt > 0 ? new Date(lastListingSyncAt).toISOString() : null,
        lastListingSyncCount,
        v2Configured: Boolean(config.marketplaceV2Address),
        v2SyncInProgress: Boolean(marketplaceV2SyncPromise),
        lastMarketplaceV2SyncAt: lastMarketplaceV2SyncAt > 0 ? new Date(lastMarketplaceV2SyncAt).toISOString() : null,
        lastMarketplaceV2ListingSyncCount,
        lastOfferSyncCount
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
    const includeListingV2 = await hasListingV2Columns(deps);
    const reports = await deps.prisma.report.findMany({
      where: status ? { status } : undefined,
      include: {
        token: {
          include: {
            listings: {
              where: { active: true },
              take: includeListingV2 ? 5 : 1,
              orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
              select: tokenListingSelect(includeListingV2)
            }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    sendJson(
      res,
      200,
      reports.map((report: any) => {
        const activeListing = pickPrimaryActiveListing(report.token.listings);
        const listingRecordId = String(activeListing?.listingId || "").trim() || null;
        return {
          id: report.id,
          listingId: parseListingId(listingRecordId || undefined),
          listingRecordId,
          marketplaceVersion: listingRecordId
            ? String(activeListing?.marketplaceVersion || (listingRecordId.startsWith("v2:") ? "v2" : "v1")).toLowerCase()
            : null,
          reason: report.reason,
          reporterAddress: report.reporterAddress,
          status: report.status,
          evidence: report.evidence,
          createdAt: report.createdAt.toISOString(),
          updatedAt: report.updatedAt.toISOString()
        };
      })
    );
    return;
  }

  if (req.method === "POST" && path === "/api/moderation/reports") {
    const payload = await readJsonBody<CreateReportPayload>(req);
    const listingRecordId = resolveListingRecordId(payload);
    if (
      !listingRecordId ||
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

  if (req.method === "POST" && path === "/api/tokens/sync") {
    if (deps.isRateLimitedImpl(deps.getClientIpImpl(req, config.trustProxy))) {
      sendJson(res, 429, { error: "Too many requests" });
      return;
    }

    const payload = await readJsonBody<SyncMintedTokenPayload>(req);
    const token = await upsertMintedToken(payload, deps, config);
    await upsertTokenPresentationRecord({
      contractAddress: payload.contractAddress,
      tokenId: payload.tokenId,
      draftName: payload.draftName,
      draftDescription: payload.draftDescription,
      mintedAmountRaw: payload.mintedAmountRaw
    });
    const presentationIndex = await readTokenPresentationIndex();
    sendJson(res, 200, {
      ok: true,
      token: toTokenApiShape(token, config, presentationIndex)
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
    const includeListingV2 = await hasListingV2Columns(deps);
    const actions = await deps.prisma.moderationAction.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        token: {
          include: {
            listings: {
              where: { active: true },
              take: includeListingV2 ? 5 : 1,
              orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
              select: tokenListingSelect(includeListingV2)
            }
          }
        }
      }
    });

    sendJson(
      res,
      200,
      actions.map((action: any) => {
        const activeListing = pickPrimaryActiveListing(action.token.listings);
        const listingRecordId = String(activeListing?.listingId || "").trim() || null;
        return {
          id: action.id,
          action: action.action,
          actor: action.actor,
          notes: action.notes,
          reportId: action.reportId,
          listingId: parseListingId(listingRecordId || undefined),
          listingRecordId,
          marketplaceVersion: listingRecordId
            ? String(activeListing?.marketplaceVersion || (listingRecordId.startsWith("v2:") ? "v2" : "v1")).toLowerCase()
            : null,
          createdAt: action.createdAt.toISOString()
        };
      })
    );
    return;
  }

  if (req.method === "GET" && path === "/api/moderation/hidden-listings") {
    sendJson(res, 200, await listHiddenListings(deps));
    return;
  }

  if (req.method === "POST" && /^\/api\/moderation\/listings\/[^/]+\/visibility$/.test(path)) {
    if (deps.isRateLimitedImpl(deps.getClientIpImpl(req, config.trustProxy))) {
      sendJson(res, 429, { error: "Too many requests" });
      return;
    }
    const listingId = String(decodeURIComponent(path.split("/")[4] || "")).trim();
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

  if (req.method === "POST" && path === "/api/admin/collections/backfill-tokens") {
    if (deps.isRateLimitedImpl(deps.getClientIpImpl(req, config.trustProxy))) {
      sendJson(res, 429, { error: "Too many requests" });
      return;
    }
    const auth = await assertAdminRequest(req, config);
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return;
    }

    const payload = await readJsonBody<BackfillCollectionTokensPayload>(req);
    const result = await backfillCollectionTokens(payload, deps, config);
    sendJson(res, 200, {
      ok: true,
      ...result
    });
    return;
  }

  if (req.method === "POST" && path === "/api/admin/collections/backfill-registry") {
    if (deps.isRateLimitedImpl(deps.getClientIpImpl(req, config.trustProxy))) {
      sendJson(res, 429, { error: "Too many requests" });
      return;
    }
    const auth = await assertAdminRequest(req, config);
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return;
    }
    const body = await readJsonBody<{ fromBlock?: number }>(req);
    const fromBlock = body.fromBlock != null ? BigInt(body.fromBlock) : 0n;
    const result = await backfillRegistryCollections(deps, config, fromBlock);
    sendJson(res, 200, { ok: true, ...result });
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

  if (req.method === "POST" && (path === "/api/admin/offers/sync" || path === "/api/admin/marketplace-v2/sync")) {
    if (deps.isRateLimitedImpl(deps.getClientIpImpl(req, config.trustProxy))) {
      sendJson(res, 429, { error: "Too many requests" });
      return;
    }
    const auth = await assertAdminRequest(req, config, undefined, { includeDynamicModerators: false });
    if (!auth.ok) {
      sendJson(res, 401, { error: auth.error });
      return;
    }
    if (!config.marketplaceV2Address) {
      sendJson(res, 409, { error: "Marketplace V2 sync is not configured" });
      return;
    }
    const syncOffersOnly = path === "/api/admin/offers/sync";
    await syncMarketplaceV2IfStale(deps, config, {
      force: true,
      includeListings: !syncOffersOnly,
      includeOffers: true
    });
    sendJson(res, 200, {
      ok: true,
      configured: true,
      syncInProgress: Boolean(marketplaceV2SyncPromise),
      lastMarketplaceV2SyncAt: lastMarketplaceV2SyncAt > 0 ? new Date(lastMarketplaceV2SyncAt).toISOString() : null,
      lastMarketplaceV2ListingSyncCount,
      lastOfferSyncCount
    });
    return;
  }

  if (req.method === "GET" && path === "/api/offers") {
    await syncMarketplaceV2IfStale(deps, config, { includeListings: false, includeOffers: true });
    const cursor = Math.max(0, Number.parseInt(String(url.searchParams.get("cursor") || "0"), 10) || 0);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(url.searchParams.get("limit") || "50"), 10) || 50));
    const buyerAddress = String(url.searchParams.get("buyer") || "").trim().toLowerCase();
    const collectionAddress = String(url.searchParams.get("collectionAddress") || "").trim().toLowerCase();
    const tokenId = String(url.searchParams.get("tokenId") || "").trim();
    const status = String(url.searchParams.get("status") || "").trim();
    const active = String(url.searchParams.get("active") || "").trim().toLowerCase();

    if (buyerAddress && !isAddress(buyerAddress)) {
      sendJson(res, 400, { error: "Valid buyer query param is required" });
      return;
    }
    if (collectionAddress && !isAddress(collectionAddress)) {
      sendJson(res, 400, { error: "Valid collectionAddress query param is required" });
      return;
    }
    if (active && active !== "true" && active !== "false") {
      sendJson(res, 400, { error: "Active query must be true or false" });
      return;
    }

    const where: Record<string, unknown> = {};
    if (buyerAddress) where.buyerAddress = buyerAddress;
    if (collectionAddress) where.collectionAddress = collectionAddress;
    if (tokenId) where.tokenId = tokenId;
    if (status) where.status = status;
    if (active) {
      where.active = active === "true";
    } else if (!status) {
      where.active = true;
    }

    const rows = await readOfferRows(deps, {
      where,
      skip: cursor,
      take: limit
    });

    sendJson(res, 200, {
      cursor,
      nextCursor: cursor + rows.length,
      canLoadMore: rows.length === limit,
      items: rows.map((item: any) => toOfferApiShape(item))
    });
    return;
  }

  if (req.method === "GET" && /^\/api\/users\/[^/]+\/offers-made$/.test(path)) {
    await syncMarketplaceV2IfStale(deps, config, { includeListings: false, includeOffers: true });
    const address = String(decodeURIComponent(path.split("/")[3] || "")).trim().toLowerCase();
    if (!address || !isAddress(address)) {
      sendJson(res, 400, { error: "Valid user address is required" });
      return;
    }

    const cursor = Math.max(0, Number.parseInt(String(url.searchParams.get("cursor") || "0"), 10) || 0);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(url.searchParams.get("limit") || "50"), 10) || 50));
    const rows = await readOfferRows(deps, {
      where: {
        buyerAddress: address,
        active: true
      },
      skip: cursor,
      take: limit
    });

    sendJson(res, 200, {
      ownerAddress: address,
      cursor,
      nextCursor: cursor + rows.length,
      canLoadMore: rows.length === limit,
      items: rows.map((item: any) => toOfferApiShape(item))
    });
    return;
  }

  if (req.method === "GET" && /^\/api\/users\/[^/]+\/holdings$/.test(path)) {
    await Promise.all([
      syncMarketplaceListingsIfStale(deps, config),
      syncMarketplaceV2IfStale(deps, config, { includeListings: true, includeOffers: true })
    ]);
    const address = String(decodeURIComponent(path.split("/")[3] || "")).trim().toLowerCase();
    if (!address || !isAddress(address)) {
      sendJson(res, 400, { error: "Valid user address is required" });
      return;
    }

    const cursor = Math.max(0, Number.parseInt(String(url.searchParams.get("cursor") || "0"), 10) || 0);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(url.searchParams.get("limit") || "50"), 10) || 50));
    const standardParam = String(url.searchParams.get("standard") || "").trim().toUpperCase();
    const standardFilter = standardParam === "ERC721" || standardParam === "ERC1155" ? standardParam : null;
    const [includeMintTxHash, includeTokenPresentation, includeListingV2, includeTokenHoldings, ownedTokenWhere] = await Promise.all([
      hasMintTxHashColumn(deps),
      hasTokenPresentationColumns(deps),
      hasListingV2Columns(deps),
      hasTokenHoldingTable(deps),
      buildOwnedTokenWhere(deps, address)
    ]);
    const presentationIndex = await readTokenPresentationIndex();

    const where = standardFilter
      ? {
          AND: [
            ownedTokenWhere,
            {
              collection: {
                is: {
                  standard: standardFilter
                }
              }
            }
          ]
        }
      : ownedTokenWhere;

    const items = await (deps.prisma.token as any).findMany({
      where,
      skip: cursor,
      take: limit,
      orderBy: [{ mintedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        tokenId: true,
        creatorAddress: true,
        ownerAddress: true,
        ...(includeMintTxHash ? { mintTxHash: true } : {}),
        ...tokenPresentationSelect(includeTokenPresentation),
        metadataCid: true,
        mediaCid: true,
        immutable: true,
        mintedAt: true,
        ...(includeTokenHoldings
          ? {
              holdings: {
                where: {
                  ownerAddress: address
                },
                select: {
                  ownerAddress: true,
                  quantityRaw: true
                }
              }
            }
          : {}),
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
          where: { active: true, sellerAddress: address },
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          take: includeListingV2 ? 50 : 1,
          select: tokenListingSelect(includeListingV2)
        }
      }
    });

    const responseItems = items.map((item: any) => toOwnerHoldingApiShape(item, address, config, presentationIndex));
    await attachOfferSummaries(responseItems as Array<any>, deps);

    sendJson(res, 200, {
      ownerAddress: address,
      cursor,
      nextCursor: cursor + items.length,
      canLoadMore: items.length === limit,
      items: responseItems
    });
    return;
  }

  if (req.method === "GET" && /^\/api\/users\/[^/]+\/offers-received$/.test(path)) {
    await syncMarketplaceV2IfStale(deps, config, { includeListings: false, includeOffers: true });
    const address = String(decodeURIComponent(path.split("/")[3] || "")).trim().toLowerCase();
    if (!address || !isAddress(address)) {
      sendJson(res, 400, { error: "Valid user address is required" });
      return;
    }

    const cursor = Math.max(0, Number.parseInt(String(url.searchParams.get("cursor") || "0"), 10) || 0);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(url.searchParams.get("limit") || "50"), 10) || 50));
    const ownedTokenWhere = await buildOwnedTokenWhere(deps, address);
    const rows = await readOfferRows(deps, {
      where: {
        active: true,
        token: {
          is: ownedTokenWhere
        }
      },
      skip: cursor,
      take: limit
    });

    sendJson(res, 200, {
      ownerAddress: address,
      cursor,
      nextCursor: cursor + rows.length,
      canLoadMore: rows.length === limit,
      items: rows.map((item: any) => toOfferApiShape(item))
    });
    return;
  }

  if (req.method === "GET" && /^\/api\/owners\/[^/]+\/summary$/.test(path)) {
    const owner = String(decodeURIComponent(path.split("/")[3] || "")).trim().toLowerCase();
    if (!owner || !isAddress(owner)) {
      sendJson(res, 400, { error: "Valid owner address is required" });
      return;
    }
    await Promise.all([
      syncMarketplaceListingsIfStale(deps, config),
      syncMarketplaceV2IfStale(deps, config, { includeListings: true, includeOffers: true })
    ]);
    const [includeMintTxHash, includeTokenPresentation, includeListingV2, includeTokenHoldings, ownedTokenWhere] = await Promise.all([
      hasMintTxHashColumn(deps),
      hasTokenPresentationColumns(deps),
      hasListingV2Columns(deps),
      hasTokenHoldingTable(deps),
      buildOwnedTokenWhere(deps, owner)
    ]);
    const presentationIndex = await readTokenPresentationIndex();

    const [
      linkedProfiles,
      collections,
      ownedTokenCount,
      createdTokenCount,
      activeListings,
      offersMade,
      offersReceived,
      recentOffersMade,
      recentOffersReceived,
      recentOwnedTokens
    ] = await Promise.all([
      readProfileRecords().then((records) => records.filter((item) => item.ownerAddress === owner).map(toProfileResponse)),
      deps.prisma.collection.findMany({
        where: { ownerAddress: owner },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
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
      deps.prisma.token.count({ where: ownedTokenWhere }),
      deps.prisma.token.count({ where: { creatorAddress: owner } }),
      deps.prisma.listing.count({ where: { sellerAddress: owner, ...getPublicActiveListingWhere(includeListingV2) } }),
      countOffers(deps, { buyerAddress: owner, active: true }),
      countOffers(deps, {
        active: true,
        token: {
          is: ownedTokenWhere
        }
      }),
      readOfferRows(deps, {
        where: {
          buyerAddress: owner,
          active: true
        },
        take: 5
      }),
      readOfferRows(deps, {
        where: {
          active: true,
          token: {
            is: ownedTokenWhere
          }
        },
        take: 5
      }),
      (deps.prisma.token as any).findMany({
        where: ownedTokenWhere,
        take: 5,
        orderBy: [{ mintedAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          tokenId: true,
          creatorAddress: true,
          ownerAddress: true,
        ...(includeMintTxHash ? { mintTxHash: true } : {}),
        ...tokenPresentationSelect(includeTokenPresentation),
        metadataCid: true,
        mediaCid: true,
        mintedAt: true,
        ...(includeTokenHoldings
          ? {
              holdings: {
                where: {
                  ownerAddress: owner
                },
                select: {
                  ownerAddress: true,
                  quantityRaw: true
                }
              }
            }
          : {}),
        listings: {
          where: { active: true, sellerAddress: owner },
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
            take: includeListingV2 ? 50 : 1,
            select: tokenListingSelect(includeListingV2)
          },
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
            ...tokenPresentationSelect(includeTokenPresentation),
            metadataCid: true,
            mediaCid: true,
            immutable: true,
            mintedAt: true,
            collectionId: true,
            listings: {
              where: { active: true },
              orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
              take: includeListingV2 ? 5 : 1,
              select: tokenListingSelect(includeListingV2)
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
        const existingTokens = existing
          ? (tokensByCollectionId.get(existing.id) || []).map((token: any) => toTokenApiShape(token, config, presentationIndex))
          : [];
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

                tokens.push(withTokenPresentation({
                  id: `chain:${contractAddress}:${tokenId}`,
                  tokenId,
                  creatorAddress: owner,
                  ownerAddress: owner,
                  mintTxHash: log.transactionHash,
                  draftName: null,
                  draftDescription: null,
                  mintedAmountRaw: null,
                  metadataCid,
                  metadataUrl: buildGatewayUrl(metadataCid),
                  mediaCid: null,
                  mediaUrl: null,
                  immutable: true,
                  mintedAt: createdAt,
                  bestOffer: null,
                  offerCount: 0,
                  activeListing: null
                }, contractAddress, presentationIndex));
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

                tokens.push(withTokenPresentation({
                  id: `chain:${contractAddress}:${tokenId}`,
                  tokenId,
                  creatorAddress: owner,
                  ownerAddress: owner,
                  mintTxHash: mintTxByTokenId.get(tokenId) || null,
                  draftName: null,
                  draftDescription: null,
                  mintedAmountRaw: balance.toString(),
                  metadataCid,
                  metadataUrl: buildGatewayUrl(metadataCid),
                  mediaCid: null,
                  mediaUrl: null,
                  immutable: true,
                  mintedAt: createdAt,
                  bestOffer: null,
                  offerCount: 0,
                  activeListing: null
                }, contractAddress, presentationIndex));
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
              tokens: (tokensByCollectionId.get(item.id) || []).map((token: any) => toTokenApiShape(token, config, presentationIndex))
            }));

    await Promise.all(
      mergedFactoryCollections.map((item) => attachOfferSummaries(item.tokens as Array<any>, deps))
    );
    const recentOwnedMints = recentOwnedTokens.map((item: any) => toOwnerHoldingApiShape(item, owner, config, presentationIndex));
    await attachOfferSummaries(recentOwnedMints as Array<any>, deps);

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
        activeListings,
        offersMade,
        offersReceived
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
      recentOwnedMints,
      recentOffersMade: recentOffersMade.map((item: any) => toOfferApiShape(item)),
      recentOffersReceived: recentOffersReceived.map((item: any) => toOfferApiShape(item))
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
    const includeAllMarkets = String(url.searchParams.get("includeAllMarkets") || "").trim().toLowerCase() === "true";
    const [includeMintTxHash, includeTokenPresentation, includeListingV2] = await Promise.all([
      hasMintTxHashColumn(deps),
      hasTokenPresentationColumns(deps),
      hasListingV2Columns(deps)
    ]);
    if (includeAllMarkets) {
      await syncMarketplaceV2IfStale(deps, config, { includeListings: true, includeOffers: false });
    }
    const presentationIndex = await readTokenPresentationIndex();

    const where: Record<string, unknown> = includeAllMarkets ? { active: true } : getPublicActiveListingWhere(includeListingV2);
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
        ...listingV2Select(includeListingV2),
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
            ...tokenPresentationSelect(includeTokenPresentation),
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

    const responseItems = rows.map((item: any) => toListingApiShape(item, config, presentationIndex));
    await attachOfferSummaries(
      responseItems
        .map((item: any) => item.token)
        .filter((item: any) => Boolean(item)),
      deps
    );

    sendJson(res, 200, {
      cursor,
      nextCursor: cursor + rows.length,
      canLoadMore: rows.length === limit,
      items: responseItems
    });
    return;
  }

  if (req.method === "GET" && path === "/api/feed") {
    const limitRaw = Number.parseInt(String(url.searchParams.get("limit") || "50"), 10);
    const cursorRaw = Number.parseInt(String(url.searchParams.get("cursor") || "0"), 10);
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 50;
    const cursor = Number.isInteger(cursorRaw) && cursorRaw >= 0 ? cursorRaw : 0;
    await Promise.all([
      syncMarketplaceListingsIfStale(deps, config),
      syncMarketplaceV2IfStale(deps, config, { includeListings: true, includeOffers: true })
    ]);
    const [includeMintTxHash, includeTokenPresentation, includeListingV2] = await Promise.all([
      hasMintTxHashColumn(deps),
      hasTokenPresentationColumns(deps),
      hasListingV2Columns(deps)
    ]);
    const presentationIndex = await readTokenPresentationIndex();

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
        ...tokenPresentationSelect(includeTokenPresentation),
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
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          take: includeListingV2 ? 5 : 1,
          select: tokenListingSelect(includeListingV2)
        }
      }
    });

    const responseItems = items.map((item: any) =>
      withTokenPresentation({
        id: item.id,
        tokenId: item.tokenId,
        creatorAddress: item.creatorAddress,
        ownerAddress: item.ownerAddress,
        mintTxHash: includeMintTxHash ? item.mintTxHash || null : null,
        draftName: item.draftName || null,
        draftDescription: item.draftDescription || null,
        mintedAmountRaw: item.mintedAmountRaw || null,
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
        activeListing: toActiveListingApiShape(pickPrimaryActiveListing(item.listings), config)
      }, item.collection.contractAddress, presentationIndex)
    );

    await attachOfferSummaries(responseItems, deps);
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
    const includeListingV2 = await hasListingV2Columns(deps);
    const [collectionCount, tokenCount, activeListingCount, openReportCount, hiddenListingRefs, profiles, paymentTokens, moderators] =
      await Promise.all([
        deps.prisma.collection.count(),
        deps.prisma.token.count(),
        deps.prisma.listing.count({ where: getPublicActiveListingWhere(includeListingV2) }),
        deps.prisma.report.count({ where: { status: "open" } }),
        listHiddenListings(deps),
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
        hiddenListings: hiddenListingRefs.listingRecordIds.length,
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

    const includeListingV2 = await hasListingV2Columns(deps);
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
            ...getPublicActiveListingWhere(includeListingV2),
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
    await syncMarketplaceV2IfStale(deps, config, { includeListings: true, includeOffers: true });
    const [includeMintTxHash, includeTokenPresentation, includeListingV2] = await Promise.all([
      hasMintTxHashColumn(deps),
      hasTokenPresentationColumns(deps),
      hasListingV2Columns(deps)
    ]);
    const presentationIndex = await readTokenPresentationIndex();

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
        ...tokenPresentationSelect(includeTokenPresentation),
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
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
          take: includeListingV2 ? 5 : 1,
          select: tokenListingSelect(includeListingV2)
        }
      }
    });

    const responseTokens = tokens.map((item: any) => ({
      ...toTokenApiShape(item, config, presentationIndex),
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
    }));
    await attachOfferSummaries(responseTokens as Array<any>, deps);

    sendJson(res, 200, {
      contractAddress,
      count: tokens.length,
      tokens: responseTokens
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
      marketplaceV2Address:
        MARKETPLACE_V2_ADDRESS && isAddress(MARKETPLACE_V2_ADDRESS.toLowerCase())
          ? (MARKETPLACE_V2_ADDRESS.toLowerCase() as `0x${string}`)
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
  server.requestTimeout = 0; // disable for long-running admin backfills

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
