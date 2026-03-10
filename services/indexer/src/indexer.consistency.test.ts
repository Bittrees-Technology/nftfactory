import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const readContractMock = vi.fn();
const getLogsMock = vi.fn(async () => []);
const getBlockNumberMock = vi.fn(async () => 100n);

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      readContract: readContractMock,
      getLogs: getLogsMock,
      getBlockNumber: getBlockNumberMock
    })),
    http: vi.fn(() => ({}))
  };
});

function createReq(params: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
}): IncomingMessage {
  const req = Readable.from(params.body ? [params.body] : []) as IncomingMessage;
  req.method = params.method;
  req.url = params.url;
  req.headers = { host: "localhost", ...(params.headers || {}) };
  (req as any).socket = { remoteAddress: "127.0.0.1" };
  return req;
}

async function runHandler(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
  req: IncomingMessage
): Promise<{ status: number; body: any }> {
  return new Promise((resolve) => {
    let statusCode = 200;
    let bodyText = "";
    const res = {
      writeHead: (status: number) => {
        statusCode = status;
      },
      end: (chunk?: string) => {
        if (chunk) bodyText += chunk;
        resolve({ status: statusCode, body: bodyText ? JSON.parse(bodyText) : null });
      }
    } as unknown as ServerResponse;

    handler(req, res);
  });
}

async function loadCreateRequestHandler() {
  vi.resetModules();
  const mod = await import("./indexer.js");
  return mod.createRequestHandler;
}

function createSchemaQueryMock(options?: {
  mintTxHash?: boolean;
  tokenPresentation?: boolean;
  listingV2?: boolean;
  offerTable?: boolean;
  tokenHoldingTable?: boolean;
  moderationListing?: boolean;
}) {
  return vi.fn(async (query: string) => {
    if (query.includes("table_name = 'Offer'")) {
      return options?.offerTable ? [{}] : [];
    }
    if (query.includes("table_name = 'TokenHolding'")) {
      return options?.tokenHoldingTable ? [{}] : [];
    }
    if (query.includes("table_name = 'Token'") && query.includes("column_name = 'mintTxHash'")) {
      return options?.mintTxHash ? [{}] : [];
    }
    if (query.includes("table_name = 'Token'") && query.includes("column_name = 'draftName'")) {
      return options?.tokenPresentation ? [{}] : [];
    }
    if (query.includes("table_name = 'Token'") && query.includes("column_name = 'draftDescription'")) {
      return options?.tokenPresentation ? [{}] : [];
    }
    if (query.includes("table_name = 'Token'") && query.includes("column_name = 'mintedAmountRaw'")) {
      return options?.tokenPresentation ? [{}] : [];
    }
    if (query.includes("table_name = 'Listing'")) {
      return options?.listingV2 ? [{}] : [];
    }
    if (query.includes("table_name = 'Report'") && query.includes("column_name = 'listingRecordId'")) {
      return options?.moderationListing ? [{}] : [];
    }
    if (query.includes("table_name = 'Report'") && query.includes("column_name = 'marketplaceVersion'")) {
      return options?.moderationListing ? [{}] : [];
    }
    if (query.includes("table_name = 'ModerationAction'") && query.includes("column_name = 'listingRecordId'")) {
      return options?.moderationListing ? [{}] : [];
    }
    if (query.includes("table_name = 'ModerationAction'") && query.includes("column_name = 'marketplaceVersion'")) {
      return options?.moderationListing ? [{}] : [];
    }
    return [];
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  readContractMock.mockReset();
  getLogsMock.mockReset();
  getLogsMock.mockResolvedValue([]);
  getBlockNumberMock.mockReset();
  getBlockNumberMock.mockResolvedValue(100n);
});

describe("indexer consistency hardening", () => {
  it("persists mint presentation fields through token sync and feed responses", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "nftfactory-indexer-"));
    vi.stubEnv("INDEXER_TOKEN_PRESENTATION_FILE", path.join(tempDir, "token-presentation.json"));

    const syncedToken = {
      id: "tok_1",
      tokenId: "7",
      creatorAddress: "0x1111111111111111111111111111111111111111",
      ownerAddress: "0x1111111111111111111111111111111111111111",
      mintTxHash: "0xabc",
      metadataCid: "ipfs://metadata",
      mediaCid: "ipfs://media",
      immutable: true,
      mintedAt: new Date("2026-03-06T12:00:00.000Z"),
      collection: {
        id: "col_1",
        chainId: 11155111,
        contractAddress: "0x2222222222222222222222222222222222222222",
        ownerAddress: "0x1111111111111111111111111111111111111111",
        ensSubname: "artist",
        standard: "ERC1155",
        isFactoryCreated: true,
        isUpgradeable: false,
        finalizedAt: null,
        createdAt: new Date("2026-03-06T12:00:00.000Z"),
        updatedAt: new Date("2026-03-06T12:00:00.000Z")
      },
      listings: []
    };

    const prisma = {
      report: {
        findMany: vi.fn(async () => []),
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        count: vi.fn(async () => 0)
      },
      moderationAction: {
        findMany: vi.fn(async () => []),
        create: vi.fn()
      },
      listing: {
        findMany: vi.fn(async () => []),
        findUnique: vi.fn(async () => ({ tokenRefId: "tok_1" })),
        upsert: vi.fn(),
        updateMany: vi.fn(async () => ({ count: 0 })),
        count: vi.fn(async () => 0)
      },
      collection: {
        findMany: vi.fn(async () => []),
        updateMany: vi.fn(async () => ({ count: 0 })),
        upsert: vi.fn(async () => syncedToken.collection),
        count: vi.fn(async () => 0)
      },
      token: {
        upsert: vi.fn(async () => syncedToken),
        findMany: vi.fn(async () => [syncedToken]),
        count: vi.fn(async () => 1)
      },
      $queryRawUnsafe: createSchemaQueryMock({ mintTxHash: true, tokenPresentation: true })
    } as unknown as PrismaClient;

    const createRequestHandler = await loadCreateRequestHandler();
    const handler = createRequestHandler(
      {
        prisma,
        getClientIpImpl: () => "127.0.0.1",
        isRateLimitedImpl: () => false
      },
      {
        chainId: 11155111,
        rpcUrl: "http://127.0.0.1:8545",
        adminToken: "",
        adminAllowlist: new Set(),
        trustProxy: false,
        marketplaceAddress: null,
        marketplaceV2Address: null,
        registryAddress: null,
        moderatorRegistryAddress: null
      }
    );

    const syncResponse = await runHandler(
      handler,
      createReq({
        method: "POST",
        url: "/api/tokens/sync",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chainId: 11155111,
          contractAddress: syncedToken.collection.contractAddress,
          collectionOwnerAddress: syncedToken.collection.ownerAddress,
          tokenId: syncedToken.tokenId,
          creatorAddress: syncedToken.creatorAddress,
          ownerAddress: syncedToken.ownerAddress,
          standard: "ERC1155",
          isFactoryCreated: true,
          isUpgradeable: false,
          ensSubname: "artist",
          mintTxHash: syncedToken.mintTxHash,
          draftName: "Studio Cut",
          draftDescription: "Master edition",
          mintedAmountRaw: "25",
          metadataCid: syncedToken.metadataCid,
          mediaCid: syncedToken.mediaCid,
          immutable: true,
          mintedAt: "2026-03-06T12:00:00.000Z"
        })
      })
    );

    expect(syncResponse.status).toBe(200);
    expect(syncResponse.body.token.draftName).toBe("Studio Cut");
    expect(syncResponse.body.token.draftDescription).toBe("Master edition");
    expect(syncResponse.body.token.mintedAmountRaw).toBe("25");
    expect((prisma.token.upsert as any).mock.calls[0][0].update).toMatchObject({
      draftName: "Studio Cut",
      draftDescription: "Master edition",
      mintedAmountRaw: "25"
    });

    const feedResponse = await runHandler(handler, createReq({ method: "GET", url: "/api/feed?cursor=0&limit=10" }));
    expect(feedResponse.status).toBe(200);
    expect(feedResponse.body.items).toHaveLength(1);
    expect(feedResponse.body.items[0].draftName).toBe("Studio Cut");
    expect(feedResponse.body.items[0].draftDescription).toBe("Master edition");
    expect(feedResponse.body.items[0].mintedAmountRaw).toBe("25");
    expect(feedResponse.body.items[0].bestOffer).toBeNull();
    expect(feedResponse.body.items[0].offerCount).toBe(0);

    await rm(tempDir, { recursive: true, force: true });
  }, 15000);

  it("hydrates tracked payment tokens with on-chain allowlist state", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "nftfactory-indexer-"));
    vi.stubEnv("INDEXER_PAYMENT_TOKEN_FILE", path.join(tempDir, "payment-tokens.json"));

    const allowedToken = "0x9999999999999999999999999999999999999999";
    readContractMock.mockImplementation(async ({ functionName, args }) => {
      if (functionName === "allowedPaymentToken") {
        return String(args?.[0] || "").toLowerCase() === allowedToken;
      }
      return false;
    });

    const prisma = {
      report: {
        findMany: vi.fn(async () => []),
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        count: vi.fn(async () => 0)
      },
      moderationAction: {
        findMany: vi.fn(async () => []),
        create: vi.fn()
      },
      listing: {
        findMany: vi.fn(async () => []),
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(),
        updateMany: vi.fn(async () => ({ count: 0 })),
        count: vi.fn(async () => 0)
      },
      collection: {
        findMany: vi.fn(async () => []),
        updateMany: vi.fn(async () => ({ count: 0 })),
        upsert: vi.fn(),
        count: vi.fn(async () => 0)
      },
      token: {
        upsert: vi.fn(),
        findMany: vi.fn(async () => []),
        count: vi.fn(async () => 0)
      },
      $queryRawUnsafe: createSchemaQueryMock()
    } as unknown as PrismaClient;

    const createRequestHandler = await loadCreateRequestHandler();
    const handler = createRequestHandler(
      {
        prisma,
        getClientIpImpl: () => "127.0.0.1",
        isRateLimitedImpl: () => false
      },
      {
        chainId: 11155111,
        rpcUrl: "http://127.0.0.1:8545",
        adminToken: "",
        adminAllowlist: new Set(),
        trustProxy: false,
        marketplaceAddress: null,
        marketplaceV2Address: null,
        registryAddress: "0x1111111111111111111111111111111111111111",
        moderatorRegistryAddress: null
      }
    );

    const logResponse = await runHandler(
      handler,
      createReq({
        method: "POST",
        url: "/api/payment-tokens/log",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tokenAddress: allowedToken,
          sellerAddress: "0x2222222222222222222222222222222222222222"
        })
      })
    );

    expect(logResponse.status).toBe(200);
    expect(logResponse.body.tokens[0].onchainAllowed).toBe(true);

    const tokensResponse = await runHandler(handler, createReq({ method: "GET", url: "/api/admin/payment-tokens" }));
    expect(tokensResponse.status).toBe(200);
    expect(tokensResponse.body.tokens).toHaveLength(1);
    expect(tokensResponse.body.tokens[0].tokenAddress).toBe(allowedToken);
    expect(tokensResponse.body.tokens[0].onchainAllowed).toBe(true);

    await rm(tempDir, { recursive: true, force: true });
  });

  it("prefers persisted token presentation columns over stale overlay records", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "nftfactory-indexer-"));
    vi.stubEnv("INDEXER_TOKEN_PRESENTATION_FILE", path.join(tempDir, "token-presentation.json"));

    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      path.join(tempDir, "token-presentation.json"),
      JSON.stringify([
        {
          contractAddress: "0x2222222222222222222222222222222222222222",
          tokenId: "7",
          draftName: "Old overlay title",
          draftDescription: "Old overlay description",
          mintedAmountRaw: "5",
          updatedAt: "2026-03-05T12:00:00.000Z"
        }
      ]),
      "utf8"
    );

    const prisma = {
      report: {
        findMany: vi.fn(async () => []),
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        count: vi.fn(async () => 0)
      },
      moderationAction: {
        findMany: vi.fn(async () => []),
        create: vi.fn()
      },
      listing: {
        findMany: vi.fn(async () => []),
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(),
        updateMany: vi.fn(async () => ({ count: 0 })),
        count: vi.fn(async () => 0)
      },
      collection: {
        findMany: vi.fn(async () => []),
        updateMany: vi.fn(async () => ({ count: 0 })),
        upsert: vi.fn(),
        count: vi.fn(async () => 0)
      },
      token: {
        findMany: vi.fn(async () => [
          {
            id: "tok_1",
            tokenId: "7",
            creatorAddress: "0x1111111111111111111111111111111111111111",
            ownerAddress: "0x1111111111111111111111111111111111111111",
            mintTxHash: "0xabc",
            draftName: "Fresh DB title",
            draftDescription: "Fresh DB description",
            mintedAmountRaw: "25",
            metadataCid: "ipfs://metadata",
            mediaCid: "ipfs://media",
            immutable: true,
            mintedAt: new Date("2026-03-06T12:00:00.000Z"),
            collection: {
              chainId: 11155111,
              contractAddress: "0x2222222222222222222222222222222222222222",
              ownerAddress: "0x1111111111111111111111111111111111111111",
              ensSubname: "artist",
              standard: "ERC1155",
              isFactoryCreated: true,
              isUpgradeable: false,
              finalizedAt: null,
              createdAt: new Date("2026-03-06T12:00:00.000Z"),
              updatedAt: new Date("2026-03-06T12:00:00.000Z")
            },
            listings: []
          }
        ]),
        count: vi.fn(async () => 1)
      },
      $queryRawUnsafe: createSchemaQueryMock({ mintTxHash: true, tokenPresentation: true })
    } as unknown as PrismaClient;

    const createRequestHandler = await loadCreateRequestHandler();
    const handler = createRequestHandler(
      {
        prisma,
        getClientIpImpl: () => "127.0.0.1",
        isRateLimitedImpl: () => false
      },
      {
        chainId: 11155111,
        rpcUrl: "http://127.0.0.1:8545",
        adminToken: "",
        adminAllowlist: new Set(),
        trustProxy: false,
        marketplaceAddress: null,
        marketplaceV2Address: null,
        registryAddress: null,
        moderatorRegistryAddress: null
      }
    );

    const feedResponse = await runHandler(handler, createReq({ method: "GET", url: "/api/feed?cursor=0&limit=10" }));
    expect(feedResponse.status).toBe(200);
    expect(feedResponse.body.items).toHaveLength(1);
    expect(feedResponse.body.items[0].draftName).toBe("Fresh DB title");
    expect(feedResponse.body.items[0].draftDescription).toBe("Fresh DB description");
    expect(feedResponse.body.items[0].mintedAmountRaw).toBe("25");

    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns on-chain amount and expiry for synced marketplace listings", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "nftfactory-indexer-"));
    vi.stubEnv("INDEXER_TOKEN_PRESENTATION_FILE", path.join(tempDir, "token-presentation.json"));

    readContractMock.mockImplementation(async ({ functionName, args }) => {
      if (functionName === "nextListingId") return 1n;
      if (functionName === "listings" && String(args?.[0]) === "0") {
        return [
          "0x3333333333333333333333333333333333333333",
          "0x2222222222222222222222222222222222222222",
          7n,
          3n,
          "ERC1155",
          "0x0000000000000000000000000000000000000000",
          10000000000000000n,
          2000000000n,
          true
        ] as const;
      }
      throw new Error(`Unexpected readContract call for ${String(functionName)}`);
    });

    const prisma = {
      report: {
        findMany: vi.fn(async () => []),
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        count: vi.fn(async () => 0)
      },
      moderationAction: {
        findMany: vi.fn(async () => []),
        create: vi.fn()
      },
      listing: {
        findMany: vi.fn(async () => [
          {
            listingId: "0",
            sellerAddress: "0x3333333333333333333333333333333333333333",
            collectionAddress: "0x2222222222222222222222222222222222222222",
            tokenId: "7",
            paymentToken: "0x0000000000000000000000000000000000000000",
            priceRaw: "10000000000000000",
            active: true,
            createdAt: new Date("2026-03-06T12:00:00.000Z"),
            updatedAt: new Date("2026-03-06T12:00:00.000Z"),
            token: {
              id: "tok_1",
              creatorAddress: "0x3333333333333333333333333333333333333333",
              ownerAddress: "0x3333333333333333333333333333333333333333",
              metadataCid: "ipfs://metadata",
              mediaCid: "ipfs://media",
              immutable: true,
              mintedAt: new Date("2026-03-06T12:00:00.000Z"),
              mintTxHash: null,
              collection: {
                chainId: 11155111,
                contractAddress: "0x2222222222222222222222222222222222222222",
                ownerAddress: "0x3333333333333333333333333333333333333333",
                ensSubname: "artist",
                standard: "ERC1155",
                isFactoryCreated: true,
                isUpgradeable: false,
                finalizedAt: null,
                createdAt: new Date("2026-03-06T12:00:00.000Z"),
                updatedAt: new Date("2026-03-06T12:00:00.000Z")
              }
            }
          }
        ]),
        findUnique: vi.fn(async () => ({ tokenRefId: "tok_1" })),
        upsert: vi.fn(async () => ({})),
        updateMany: vi.fn(async () => ({ count: 0 })),
        count: vi.fn(async () => 1)
      },
      collection: {
        findMany: vi.fn(async () => []),
        updateMany: vi.fn(async () => ({ count: 0 })),
        upsert: vi.fn(async () => ({ id: "col_1" })),
        count: vi.fn(async () => 1)
      },
      token: {
        upsert: vi.fn(),
        findMany: vi.fn(async () => []),
        findFirst: vi.fn(async () => ({ id: "tok_1" })),
        count: vi.fn(async () => 1)
      },
      $queryRawUnsafe: createSchemaQueryMock({ listingV2: true })
    } as unknown as PrismaClient;

    const createRequestHandler = await loadCreateRequestHandler();
    const handler = createRequestHandler(
      {
        prisma,
        getClientIpImpl: () => "127.0.0.1",
        isRateLimitedImpl: () => false
      },
      {
        chainId: 11155111,
        rpcUrl: "http://127.0.0.1:8545",
        adminToken: "",
        adminAllowlist: new Set(),
        trustProxy: false,
        marketplaceAddress: "0x4444444444444444444444444444444444444444",
        marketplaceV2Address: null,
        registryAddress: null,
        moderatorRegistryAddress: null
      }
    );

    const response = await runHandler(handler, createReq({ method: "GET", url: "/api/listings?cursor=0&limit=10" }));
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].amountRaw).toBe("3");
    expect(response.body.items[0].expiresAtRaw).toBe("2000000000");
    expect(response.body.items[0].standard).toBe("ERC1155");
    expect((prisma.listing.upsert as any).mock.calls[0][0].update).toMatchObject({
      marketplaceVersion: "v1",
      amountRaw: "3",
      standard: "ERC1155",
      expiresAtRaw: "2000000000"
    });

    await rm(tempDir, { recursive: true, force: true });
  });

  it("normalizes v2 listing references in feed and include-all listing responses", async () => {
    const tokenWithV2Listing = {
      id: "tok_v2_feed",
      tokenId: "7",
      creatorAddress: "0x1111111111111111111111111111111111111111",
      ownerAddress: "0x1111111111111111111111111111111111111111",
      mintTxHash: null,
      draftName: "Fresh drop",
      draftDescription: "With V2 listing",
      mintedAmountRaw: "1",
      metadataCid: "ipfs://metadata",
      mediaCid: "ipfs://media",
      immutable: true,
      mintedAt: new Date("2026-03-06T12:00:00.000Z"),
      collection: {
        chainId: 11155111,
        contractAddress: "0x2222222222222222222222222222222222222222",
        ownerAddress: "0x1111111111111111111111111111111111111111",
        ensSubname: "artist",
        standard: "ERC721",
        isFactoryCreated: true,
        isUpgradeable: false,
        finalizedAt: null,
        createdAt: new Date("2026-03-06T12:00:00.000Z"),
        updatedAt: new Date("2026-03-06T12:00:00.000Z")
      },
      listings: [
        {
          listingId: "v2:3",
          marketplaceVersion: "v2",
          sellerAddress: "0x3333333333333333333333333333333333333333",
          paymentToken: "0x0000000000000000000000000000000000000000",
          priceRaw: "10000000000000000",
          amountRaw: "1",
          standard: "ERC721",
          expiresAtRaw: "2000000000",
          active: true,
          createdAt: new Date("2026-03-06T12:00:00.000Z"),
          updatedAt: new Date("2026-03-06T12:05:00.000Z"),
          lastSyncedAt: new Date("2026-03-06T12:05:00.000Z")
        }
      ]
    };

    const listingRow = {
      listingId: "v2:3",
      marketplaceVersion: "v2",
      sellerAddress: "0x3333333333333333333333333333333333333333",
      collectionAddress: "0x2222222222222222222222222222222222222222",
      tokenId: "7",
      amountRaw: "1",
      standard: "ERC721",
      paymentToken: "0x0000000000000000000000000000000000000000",
      priceRaw: "10000000000000000",
      expiresAtRaw: "2000000000",
      active: true,
      buyerAddress: null,
      txHash: null,
      cancelledAt: null,
      soldAt: null,
      lastSyncedAt: new Date("2026-03-06T12:05:00.000Z"),
      createdAt: new Date("2026-03-06T12:00:00.000Z"),
      updatedAt: new Date("2026-03-06T12:05:00.000Z"),
      token: tokenWithV2Listing
    };

    const prisma = {
      report: {
        findMany: vi.fn(async () => []),
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        count: vi.fn(async () => 0)
      },
      moderationAction: {
        findMany: vi.fn(async () => []),
        create: vi.fn()
      },
      listing: {
        findMany: vi.fn(async () => [listingRow]),
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(),
        updateMany: vi.fn(async () => ({ count: 0 })),
        count: vi.fn(async () => 1)
      },
      collection: {
        findMany: vi.fn(async () => []),
        updateMany: vi.fn(async () => ({ count: 0 })),
        upsert: vi.fn(async () => ({ id: "col_1" })),
        count: vi.fn(async () => 1)
      },
      token: {
        findMany: vi.fn(async () => [tokenWithV2Listing]),
        count: vi.fn(async () => 1)
      },
      $queryRawUnsafe: createSchemaQueryMock({ mintTxHash: true, tokenPresentation: true, listingV2: true, offerTable: false })
    } as unknown as PrismaClient;

    const createRequestHandler = await loadCreateRequestHandler();
    const handler = createRequestHandler(
      {
        prisma,
        getClientIpImpl: () => "127.0.0.1",
        isRateLimitedImpl: () => false
      },
      {
        chainId: 11155111,
        rpcUrl: "http://127.0.0.1:8545",
        adminToken: "",
        adminAllowlist: new Set(),
        trustProxy: false,
        marketplaceAddress: "0x4444444444444444444444444444444444444444",
        marketplaceV2Address: null,
        registryAddress: null,
        moderatorRegistryAddress: null
      }
    );

    const [feedResponse, listingsResponse] = await Promise.all([
      runHandler(handler, createReq({ method: "GET", url: "/api/feed?cursor=0&limit=10" })),
      runHandler(handler, createReq({ method: "GET", url: "/api/listings?cursor=0&limit=10&includeAllMarkets=true" }))
    ]);

    expect(feedResponse.status).toBe(200);
    expect(feedResponse.body.items[0].activeListing).toMatchObject({
      listingId: "3",
      listingRecordId: "v2:3",
      marketplaceVersion: "v2"
    });

    expect(listingsResponse.status).toBe(200);
    expect(listingsResponse.body.items[0]).toMatchObject({
      id: 3,
      listingId: "3",
      listingRecordId: "v2:3",
      marketplaceVersion: "v2"
    });
  });

  it("syncs marketplace v2 listings and offers from the admin endpoint", async () => {
    readContractMock.mockImplementation(async ({ address, functionName, args }) => {
      const normalizedAddress = String(address).toLowerCase();
      if (normalizedAddress !== "0x5555555555555555555555555555555555555555") {
        throw new Error(`Unexpected contract address ${normalizedAddress}`);
      }
      if (functionName === "nextListingId") return 1n;
      if (functionName === "listings" && String(args?.[0]) === "0") {
        return [
          "0x3333333333333333333333333333333333333333",
          "0x2222222222222222222222222222222222222222",
          7n,
          2n,
          "ERC1155",
          "0x0000000000000000000000000000000000000000",
          5000000000000000n,
          2000000000n,
          true
        ] as const;
      }
      if (functionName === "nextOfferId") return 1n;
      if (functionName === "offers" && String(args?.[0]) === "0") {
        return [
          "0x1111111111111111111111111111111111111111",
          "0x2222222222222222222222222222222222222222",
          7n,
          2n,
          "ERC1155",
          "0x0000000000000000000000000000000000000000",
          4000000000000000n,
          2000000000n,
          true
        ] as const;
      }
      throw new Error(`Unexpected readContract call for ${String(functionName)}`);
    });

    const prisma = {
      listing: {
        upsert: vi.fn(async () => ({})),
        updateMany: vi.fn(async () => ({ count: 0 }))
      },
      offer: {
        upsert: vi.fn(async () => ({}))
      },
      token: {
        findFirst: vi.fn(async () => ({ id: "tok_v2_1" }))
      },
      $queryRawUnsafe: createSchemaQueryMock({ listingV2: true, offerTable: true })
    } as unknown as PrismaClient;

    const createRequestHandler = await loadCreateRequestHandler();
    const handler = createRequestHandler(
      {
        prisma,
        getClientIpImpl: () => "127.0.0.1",
        isRateLimitedImpl: () => false
      },
      {
        chainId: 11155111,
        rpcUrl: "http://127.0.0.1:8545",
        adminToken: "secret",
        adminAllowlist: new Set(),
        trustProxy: false,
        marketplaceAddress: null,
        marketplaceV2Address: "0x5555555555555555555555555555555555555555",
        registryAddress: null,
        moderatorRegistryAddress: null
      }
    );

    const response = await runHandler(
      handler,
      createReq({
        method: "POST",
        url: "/api/admin/marketplace-v2/sync",
        headers: { authorization: "Bearer secret" }
      })
    );

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.lastMarketplaceV2ListingSyncCount).toBe(1);
    expect(response.body.lastOfferSyncCount).toBe(1);
    expect((prisma.listing.upsert as any).mock.calls[0][0]).toMatchObject({
      where: { listingId: "v2:0" },
      update: expect.objectContaining({
        marketplaceVersion: "v2",
        tokenRefId: "tok_v2_1",
        amountRaw: "2"
      })
    });
    expect((prisma.offer.upsert as any).mock.calls[0][0]).toMatchObject({
      where: { offerId: "0" },
      update: expect.objectContaining({
        marketplaceVersion: "v2",
        tokenRefId: "tok_v2_1",
        status: "active",
        quantityRaw: "2"
      })
    });
  });

  it("does not let a recent v2 offer sync suppress listing sync", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "nftfactory-indexer-sync-state-"));
    vi.stubEnv("INDEXER_MARKETPLACE_V2_SYNC_STATE_FILE", path.join(tempDir, "marketplace-v2-sync-state.json"));
    readContractMock.mockImplementation(async ({ functionName, args }) => {
      if (functionName === "nextOfferId") return 1n;
      if (functionName === "offers" && String(args?.[0]) === "0") {
        return [
          "0x1111111111111111111111111111111111111111",
          "0x2222222222222222222222222222222222222222",
          7n,
          2n,
          "ERC1155",
          "0x0000000000000000000000000000000000000000",
          4000000000000000n,
          2000000000n,
          true
        ] as const;
      }
      if (functionName === "nextListingId") return 1n;
      if (functionName === "listings" && String(args?.[0]) === "0") {
        return [
          "0x3333333333333333333333333333333333333333",
          "0x2222222222222222222222222222222222222222",
          7n,
          2n,
          "ERC1155",
          "0x0000000000000000000000000000000000000000",
          5000000000000000n,
          2000000000n,
          true
        ] as const;
      }
      throw new Error(`Unexpected readContract call for ${String(functionName)}`);
    });

    const listingUpsert = vi.fn(async () => ({}));
    const offerUpsert = vi.fn(async () => ({}));
    const prisma = {
      listing: {
        upsert: listingUpsert,
        updateMany: vi.fn(async () => ({ count: 0 })),
        findMany: vi.fn(async () => []),
        count: vi.fn(async () => 0)
      },
      offer: {
        upsert: offerUpsert,
        findMany: vi.fn(async () => []),
        count: vi.fn(async () => 0)
      },
      token: {
        findFirst: vi.fn(async () => ({ id: "tok_v2_1" }))
      },
      $queryRawUnsafe: createSchemaQueryMock({ listingV2: true, offerTable: true })
    } as unknown as PrismaClient;

    const createRequestHandler = await loadCreateRequestHandler();
    const handler = createRequestHandler(
      {
        prisma,
        getClientIpImpl: () => "127.0.0.1",
        isRateLimitedImpl: () => false
      },
      {
        chainId: 11155111,
        rpcUrl: "http://127.0.0.1:8545",
        adminToken: "",
        adminAllowlist: new Set(),
        trustProxy: false,
        marketplaceAddress: null,
        marketplaceV2Address: "0x5555555555555555555555555555555555555555",
        registryAddress: null,
        moderatorRegistryAddress: null
      }
    );

    const offersResponse = await runHandler(
      handler,
      createReq({
        method: "GET",
        url: "/api/offers"
      })
    );
    expect(offersResponse.status).toBe(200);
    expect(offerUpsert).toHaveBeenCalledTimes(1);
    expect(listingUpsert).not.toHaveBeenCalled();

    const listingsResponse = await runHandler(
      handler,
      createReq({
        method: "GET",
        url: "/api/listings?includeAllMarkets=true"
      })
    );
    expect(listingsResponse.status).toBe(200);
    expect(listingUpsert).toHaveBeenCalledTimes(1);
    expect(offerUpsert).toHaveBeenCalledTimes(1);
  });

  it("keeps ERC1155 primary ownership with the seller after partial offer acceptance", async () => {
    const sellerAddress = "0x3333333333333333333333333333333333333333";
    const buyerAddress = "0x1111111111111111111111111111111111111111";
    const collectionAddress = "0x2222222222222222222222222222222222222222";
    const tokenUpdate = vi.fn(async () => ({}));
    const tokenHoldingUpsert = vi.fn(async () => ({}));

    readContractMock.mockImplementation(async ({ functionName, args }) => {
      if (functionName === "nextOfferId") return 1n;
      if (functionName === "offers" && String(args?.[0]) === "0") {
        return [
          buyerAddress,
          collectionAddress,
          7n,
          2n,
          "ERC1155",
          "0x0000000000000000000000000000000000000000",
          4000000000000000n,
          2000000000n,
          true
        ] as const;
      }
      throw new Error(`Unexpected readContract call for ${String(functionName)}`);
    });
    getLogsMock.mockImplementation(async ({ event }) => {
      if (event?.name === "OfferAccepted") {
        return [
          {
            args: {
              offerId: 0n,
              seller: sellerAddress,
              buyer: buyerAddress,
              quantity: 2n
            },
            transactionHash: "0xabc123"
          }
        ];
      }
      return [];
    });

    const prisma = {
      offer: {
        upsert: vi.fn(async () => ({})),
        findUnique: vi.fn(async () => ({ acceptedTxHash: null }))
      },
      token: {
        findFirst: vi.fn(async () => ({ id: "tok_v2_1" })),
        update: tokenUpdate
      },
      tokenHolding: {
        findUnique: vi.fn(async ({ where }) => {
          const ownerAddress = String(where?.tokenId_ownerAddress?.ownerAddress || "").toLowerCase();
          if (ownerAddress === sellerAddress) {
            return { quantityRaw: "5" };
          }
          if (ownerAddress === buyerAddress) {
            return null;
          }
          return null;
        }),
        upsert: tokenHoldingUpsert,
        findMany: vi.fn(async () => [
          { ownerAddress: sellerAddress, quantityRaw: "3" },
          { ownerAddress: buyerAddress, quantityRaw: "2" }
        ])
      },
      $queryRawUnsafe: createSchemaQueryMock({ offerTable: true, tokenHoldingTable: true })
    } as unknown as PrismaClient;

    const createRequestHandler = await loadCreateRequestHandler();
    const handler = createRequestHandler(
      {
        prisma,
        getClientIpImpl: () => "127.0.0.1",
        isRateLimitedImpl: () => false
      },
      {
        chainId: 11155111,
        rpcUrl: "http://127.0.0.1:8545",
        adminToken: "secret",
        adminAllowlist: new Set(),
        trustProxy: false,
        marketplaceAddress: null,
        marketplaceV2Address: "0x5555555555555555555555555555555555555555",
        registryAddress: null,
        moderatorRegistryAddress: null
      }
    );

    const response = await runHandler(
      handler,
      createReq({
        method: "POST",
        url: "/api/admin/offers/sync",
        headers: { authorization: "Bearer secret" }
      })
    );

    expect(response.status).toBe(200);
    expect(tokenHoldingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tokenId_ownerAddress: {
            tokenId: "tok_v2_1",
            ownerAddress: sellerAddress
          }
        },
        update: {
          quantityRaw: "3"
        }
      })
    );
    expect(tokenHoldingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tokenId_ownerAddress: {
            tokenId: "tok_v2_1",
            ownerAddress: buyerAddress
          }
        },
        update: {
          quantityRaw: "2"
        }
      })
    );
    expect(tokenUpdate).toHaveBeenLastCalledWith({
      where: { id: "tok_v2_1" },
      data: {
        ownerAddress: sellerAddress
      }
    });
  });

  it("serializes ERC1155 feed and listing owners from indexed holdings", async () => {
    const sellerAddress = "0x3333333333333333333333333333333333333333";
    const buyerAddress = "0x1111111111111111111111111111111111111111";
    const baseToken = {
      id: "tok_1",
      tokenId: "7",
      creatorAddress: sellerAddress,
      ownerAddress: buyerAddress,
      draftName: "Edition Seven",
      draftDescription: "Split ownership",
      mintedAmountRaw: "5",
      metadataCid: "ipfs://metadata",
      mediaCid: null,
      immutable: true,
      mintedAt: new Date("2026-03-06T12:00:00.000Z"),
      holdings: [
        { ownerAddress: sellerAddress, quantityRaw: "3" },
        { ownerAddress: buyerAddress, quantityRaw: "2" }
      ],
      listings: [],
      collection: {
        chainId: 11155111,
        contractAddress: "0x2222222222222222222222222222222222222222",
        ownerAddress: sellerAddress,
        ensSubname: "artist",
        standard: "ERC1155",
        isFactoryCreated: true,
        isUpgradeable: false,
        finalizedAt: null,
        createdAt: new Date("2026-03-06T12:00:00.000Z"),
        updatedAt: new Date("2026-03-06T12:00:00.000Z")
      }
    };

    const prisma = {
      report: {
        findMany: vi.fn(async () => []),
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        count: vi.fn(async () => 0)
      },
      moderationAction: {
        findMany: vi.fn(async () => []),
        create: vi.fn()
      },
      token: {
        findMany: vi.fn(async () => [baseToken]),
        count: vi.fn(async () => 1)
      },
      listing: {
        findMany: vi.fn(async () => [
          {
            listingId: "v2:21",
            sellerAddress,
            collectionAddress: baseToken.collection.contractAddress,
            tokenId: "7",
            marketplaceVersion: "v2",
            amountRaw: "2",
            standard: "ERC1155",
            paymentToken: "0x0000000000000000000000000000000000000000",
            priceRaw: "10000000000000000",
            expiresAtRaw: "2000000000",
            active: true,
            buyerAddress: null,
            txHash: null,
            cancelledAt: null,
            soldAt: null,
            lastSyncedAt: new Date("2026-03-06T12:00:00.000Z"),
            createdAt: new Date("2026-03-06T12:00:00.000Z"),
            updatedAt: new Date("2026-03-06T12:00:00.000Z"),
            token: {
              ...baseToken,
              listings: []
            }
          }
        ]),
        count: vi.fn(async () => 1)
      },
      $queryRawUnsafe: createSchemaQueryMock({
        tokenPresentation: true,
        listingV2: true,
        tokenHoldingTable: true
      })
    } as unknown as PrismaClient;

    const createRequestHandler = await loadCreateRequestHandler();
    const handler = createRequestHandler(
      {
        prisma,
        getClientIpImpl: () => "127.0.0.1",
        isRateLimitedImpl: () => false
      },
      {
        chainId: 11155111,
        rpcUrl: "http://127.0.0.1:8545",
        adminToken: "",
        adminAllowlist: new Set(),
        trustProxy: false,
        marketplaceAddress: null,
        marketplaceV2Address: null,
        registryAddress: null,
        moderatorRegistryAddress: null
      }
    );

    const [feedResponse, listingsResponse] = await Promise.all([
      runHandler(handler, createReq({ method: "GET", url: "/api/feed?cursor=0&limit=10" })),
      runHandler(handler, createReq({ method: "GET", url: "/api/listings?includeAllMarkets=true&cursor=0&limit=10" }))
    ]);

    expect(feedResponse.status).toBe(200);
    expect(feedResponse.body.items[0]).toMatchObject({
      ownerAddress: sellerAddress,
      currentOwnerAddress: sellerAddress,
      currentOwnerAddresses: [sellerAddress, buyerAddress]
    });

    expect(listingsResponse.status).toBe(200);
    expect(listingsResponse.body.items[0].token).toMatchObject({
      ownerAddress: sellerAddress,
      currentOwnerAddress: sellerAddress,
      currentOwnerAddresses: [sellerAddress, buyerAddress]
    });
  });

  it("incrementally syncs only changed v2 listings after a checkpoint exists", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "nftfactory-indexer-sync-state-"));
    vi.stubEnv("INDEXER_MARKETPLACE_V2_SYNC_STATE_FILE", path.join(tempDir, "marketplace-v2-sync-state.json"));

    let phase: 1 | 2 = 1;
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockImplementation(() => (phase === 1 ? 1_700_000_000_000 : 1_700_000_060_000));
    getBlockNumberMock.mockImplementation(async () => (phase === 1 ? 100n : 105n));
    readContractMock.mockImplementation(async ({ functionName, args }) => {
      if (functionName === "nextListingId") return 1n;
      if (phase === 1 && functionName === "listings" && String(args?.[0]) === "0") {
        return [
          "0x3333333333333333333333333333333333333333",
          "0x2222222222222222222222222222222222222222",
          7n,
          2n,
          "ERC1155",
          "0x0000000000000000000000000000000000000000",
          5000000000000000n,
          2000000000n,
          true
        ] as const;
      }
      if (phase === 2 && functionName === "listings" && String(args?.[0]) === "1") {
        return [
          "0x4444444444444444444444444444444444444444",
          "0x2222222222222222222222222222222222222222",
          8n,
          1n,
          "ERC721",
          "0x0000000000000000000000000000000000000000",
          6000000000000000n,
          2000000100n,
          true
        ] as const;
      }
      throw new Error(`Unexpected readContract call for ${String(functionName)} with ${String(args?.[0])}`);
    });
    getLogsMock.mockImplementation(async ({ event }) => {
      if (phase === 2 && event?.name === "Listed") {
        return [
          {
            args: { listingId: 1n },
            transactionHash: "0xlisted"
          }
        ];
      }
      return [];
    });

    const listingUpsert = vi.fn(async () => ({}));
    const prisma = {
      listing: {
        upsert: listingUpsert,
        updateMany: vi.fn(async () => ({ count: 0 })),
        findMany: vi.fn(async () => []),
        count: vi.fn(async () => 0)
      },
      token: {
        findFirst: vi.fn(async ({ where }) => ({ id: `tok_${where?.tokenId}` })),
        findMany: vi.fn(async () => [])
      },
      offer: {
        findMany: vi.fn(async () => []),
        count: vi.fn(async () => 0)
      },
      $queryRawUnsafe: createSchemaQueryMock({ listingV2: true, offerTable: false })
    } as unknown as PrismaClient;

    const createRequestHandler = await loadCreateRequestHandler();
    const handler = createRequestHandler(
      {
        prisma,
        getClientIpImpl: () => "127.0.0.1",
        isRateLimitedImpl: () => false
      },
      {
        chainId: 11155111,
        rpcUrl: "http://127.0.0.1:8545",
        adminToken: "secret",
        adminAllowlist: new Set(),
        trustProxy: false,
        marketplaceAddress: null,
        marketplaceV2Address: "0x5555555555555555555555555555555555555555",
        registryAddress: null,
        moderatorRegistryAddress: null
      }
    );

    const initialResponse = await runHandler(
      handler,
      createReq({
        method: "POST",
        url: "/api/admin/marketplace-v2/sync",
        headers: { authorization: "Bearer secret" }
      })
    );
    expect(initialResponse.status).toBe(200);
    expect(listingUpsert).toHaveBeenCalledTimes(1);

    phase = 2;
    const incrementalResponse = await runHandler(
      handler,
      createReq({
        method: "GET",
        url: "/api/listings?includeAllMarkets=true"
      })
    );

    expect(incrementalResponse.status).toBe(200);
    expect(listingUpsert).toHaveBeenCalledTimes(2);
    expect((listingUpsert as any).mock.calls[1][0]).toMatchObject({
      where: { listingId: "v2:1" },
      update: expect.objectContaining({
        tokenId: "8",
        marketplaceVersion: "v2"
      })
    });
  });

  it("incrementally syncs only changed v2 offers after a checkpoint exists", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "nftfactory-indexer-sync-state-"));
    vi.stubEnv("INDEXER_MARKETPLACE_V2_SYNC_STATE_FILE", path.join(tempDir, "marketplace-v2-sync-state.json"));

    let phase: 1 | 2 = 1;
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockImplementation(() => (phase === 1 ? 1_700_000_000_000 : 1_700_000_060_000));
    getBlockNumberMock.mockImplementation(async () => (phase === 1 ? 100n : 105n));
    readContractMock.mockImplementation(async ({ functionName, args }) => {
      if (functionName === "nextOfferId") return 1n;
      if (phase === 1 && functionName === "offers" && String(args?.[0]) === "0") {
        return [
          "0x1111111111111111111111111111111111111111",
          "0x2222222222222222222222222222222222222222",
          7n,
          2n,
          "ERC1155",
          "0x0000000000000000000000000000000000000000",
          4000000000000000n,
          2000000000n,
          true
        ] as const;
      }
      if (phase === 2 && functionName === "offers" && String(args?.[0]) === "1") {
        return [
          "0x9999999999999999999999999999999999999999",
          "0x2222222222222222222222222222222222222222",
          8n,
          1n,
          "ERC721",
          "0x0000000000000000000000000000000000000000",
          5000000000000000n,
          2000000100n,
          true
        ] as const;
      }
      throw new Error(`Unexpected readContract call for ${String(functionName)} with ${String(args?.[0])}`);
    });
    getLogsMock.mockImplementation(async ({ event }) => {
      if (phase === 2 && event?.name === "OfferCreated") {
        return [
          {
            args: { offerId: 1n },
            transactionHash: "0xoffercreated"
          }
        ];
      }
      return [];
    });

    const offerUpsert = vi.fn(async () => ({}));
    const prisma = {
      offer: {
        upsert: offerUpsert,
        findUnique: vi.fn(async () => ({ acceptedTxHash: null })),
        findMany: vi.fn(async () => []),
        count: vi.fn(async () => 0),
        updateMany: vi.fn(async () => ({ count: 0 }))
      },
      token: {
        findFirst: vi.fn(async ({ where }) => ({ id: `tok_${where?.tokenId}` }))
      },
      $queryRawUnsafe: createSchemaQueryMock({ offerTable: true })
    } as unknown as PrismaClient;

    const createRequestHandler = await loadCreateRequestHandler();
    const handler = createRequestHandler(
      {
        prisma,
        getClientIpImpl: () => "127.0.0.1",
        isRateLimitedImpl: () => false
      },
      {
        chainId: 11155111,
        rpcUrl: "http://127.0.0.1:8545",
        adminToken: "secret",
        adminAllowlist: new Set(),
        trustProxy: false,
        marketplaceAddress: null,
        marketplaceV2Address: "0x5555555555555555555555555555555555555555",
        registryAddress: null,
        moderatorRegistryAddress: null
      }
    );

    const initialResponse = await runHandler(
      handler,
      createReq({
        method: "POST",
        url: "/api/admin/offers/sync",
        headers: { authorization: "Bearer secret" }
      })
    );
    expect(initialResponse.status).toBe(200);
    expect(offerUpsert).toHaveBeenCalledTimes(1);

    phase = 2;
    const incrementalResponse = await runHandler(
      handler,
      createReq({
        method: "GET",
        url: "/api/offers"
      })
    );

    expect(incrementalResponse.status).toBe(200);
    expect(offerUpsert).toHaveBeenCalledTimes(2);
    expect((offerUpsert as any).mock.calls[1][0]).toMatchObject({
      where: { offerId: "1" },
      update: expect.objectContaining({
        tokenId: "8",
        marketplaceVersion: "v2"
      })
    });
  });

  it("returns empty offer responses before the Offer table is available", async () => {
    const prisma = {
      report: {
        findMany: vi.fn(async () => []),
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        count: vi.fn(async () => 0)
      },
      moderationAction: {
        findMany: vi.fn(async () => []),
        create: vi.fn()
      },
      listing: {
        findMany: vi.fn(async () => []),
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(),
        updateMany: vi.fn(async () => ({ count: 0 })),
        count: vi.fn(async () => 0)
      },
      collection: {
        findMany: vi.fn(async () => []),
        updateMany: vi.fn(async () => ({ count: 0 })),
        upsert: vi.fn(async () => ({ id: "col_1" })),
        count: vi.fn(async () => 0)
      },
      token: {
        upsert: vi.fn(),
        findMany: vi.fn(async () => []),
        count: vi.fn(async () => 0)
      },
      $queryRawUnsafe: createSchemaQueryMock({ offerTable: false })
    } as unknown as PrismaClient;

    const createRequestHandler = await loadCreateRequestHandler();
    const handler = createRequestHandler(
      {
        prisma,
        getClientIpImpl: () => "127.0.0.1",
        isRateLimitedImpl: () => false
      },
      {
        chainId: 11155111,
        rpcUrl: "http://127.0.0.1:8545",
        adminToken: "",
        adminAllowlist: new Set(),
        trustProxy: false,
        marketplaceAddress: null,
        marketplaceV2Address: null,
        registryAddress: null,
        moderatorRegistryAddress: null
      }
    );

    const [offersResponse, offersMadeResponse, offersReceivedResponse, healthResponse] = await Promise.all([
      runHandler(handler, createReq({ method: "GET", url: "/api/offers?cursor=0&limit=10" })),
      runHandler(
        handler,
        createReq({
          method: "GET",
          url: "/api/users/0x1111111111111111111111111111111111111111/offers-made?cursor=0&limit=10"
        })
      ),
      runHandler(
        handler,
        createReq({
          method: "GET",
          url: "/api/users/0x1111111111111111111111111111111111111111/offers-received?cursor=0&limit=10"
        })
      ),
      runHandler(handler, createReq({ method: "GET", url: "/health" }))
    ]);

    expect(offersResponse.status).toBe(200);
    expect(offersResponse.body.items).toEqual([]);
    expect(offersMadeResponse.status).toBe(200);
    expect(offersMadeResponse.body.items).toEqual([]);
    expect(offersReceivedResponse.status).toBe(200);
    expect(offersReceivedResponse.body.items).toEqual([]);
    expect(healthResponse.status).toBe(200);
    expect(healthResponse.body.schema.offerTableAvailable).toBe(false);
  });

  it("returns indexed offer standards from the offers api", async () => {
    const prisma = {
      report: {
        findMany: vi.fn(async () => []),
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        count: vi.fn(async () => 0)
      },
      moderationAction: {
        findMany: vi.fn(async () => []),
        create: vi.fn()
      },
      listing: {
        findMany: vi.fn(async () => []),
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(),
        updateMany: vi.fn(async () => ({ count: 0 })),
        count: vi.fn(async () => 0)
      },
      collection: {
        findMany: vi.fn(async () => []),
        updateMany: vi.fn(async () => ({ count: 0 })),
        upsert: vi.fn(async () => ({ id: "col_1" })),
        count: vi.fn(async () => 0)
      },
      token: {
        upsert: vi.fn(),
        findMany: vi.fn(async () => []),
        count: vi.fn(async () => 0)
      },
      offer: {
        findMany: vi.fn(async () => [
          {
            id: "offer_row_1",
            offerId: "12",
            chainId: 11155111,
            marketplaceVersion: "v2",
            collectionAddress: "0x2222222222222222222222222222222222222222",
            tokenId: "7",
            buyerAddress: "0x1111111111111111111111111111111111111111",
            paymentToken: "0x0000000000000000000000000000000000000000",
            quantityRaw: "3",
            priceRaw: "10000000000000000",
            expiresAtRaw: "2000000000",
            status: "active",
            active: true,
            acceptedByAddress: null,
            acceptedSellerAddress: null,
            acceptedTxHash: null,
            cancelledTxHash: null,
            createdAt: new Date("2026-03-06T12:00:00.000Z"),
            updatedAt: new Date("2026-03-06T12:00:00.000Z"),
            lastSyncedAt: new Date("2026-03-06T12:00:00.000Z"),
            token: {
              collection: {
                standard: "ERC1155"
              }
            }
          }
        ]),
        count: vi.fn(async () => 1)
      },
      $queryRawUnsafe: createSchemaQueryMock({ offerTable: true })
    } as unknown as PrismaClient;

    const createRequestHandler = await loadCreateRequestHandler();
    const handler = createRequestHandler(
      {
        prisma,
        getClientIpImpl: () => "127.0.0.1",
        isRateLimitedImpl: () => false
      },
      {
        chainId: 11155111,
        rpcUrl: "http://127.0.0.1:8545",
        adminToken: "",
        adminAllowlist: new Set(),
        trustProxy: false,
        marketplaceAddress: null,
        marketplaceV2Address: null,
        registryAddress: null,
        moderatorRegistryAddress: null
      }
    );

    const response = await runHandler(handler, createReq({ method: "GET", url: "/api/offers?cursor=0&limit=10" }));

    expect(response.status).toBe(200);
    expect(response.body.items[0]).toMatchObject({
      offerId: "12",
      standard: "ERC1155",
      quantityRaw: "3"
    });
  });

  it("returns holdings-backed recipients for received offers and reports token holding schema health", async () => {
    const ownerAddress = "0x1111111111111111111111111111111111111111";
    const secondaryOwnerAddress = "0x3333333333333333333333333333333333333333";
    const offerFindMany = vi.fn(async () => [
      {
        id: "offer_row_1",
        offerId: "12",
        chainId: 11155111,
        marketplaceVersion: "v2",
        collectionAddress: "0x2222222222222222222222222222222222222222",
        tokenId: "7",
        buyerAddress: "0x9999999999999999999999999999999999999999",
        paymentToken: "0x0000000000000000000000000000000000000000",
        quantityRaw: "2",
        priceRaw: "10000000000000000",
        expiresAtRaw: "2000000000",
        status: "active",
        active: true,
        acceptedByAddress: null,
        acceptedSellerAddress: null,
        acceptedTxHash: null,
        cancelledTxHash: null,
        createdAt: new Date("2026-03-06T12:00:00.000Z"),
        updatedAt: new Date("2026-03-06T12:00:00.000Z"),
        lastSyncedAt: new Date("2026-03-06T12:00:00.000Z"),
        token: {
          ownerAddress: ownerAddress,
          holdings: [
            { ownerAddress, quantityRaw: "2" },
            { ownerAddress: secondaryOwnerAddress, quantityRaw: "1" }
          ],
          collection: {
            standard: "ERC1155"
          }
        }
      }
    ]);

    const prisma = {
      report: {
        findMany: vi.fn(async () => []),
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        count: vi.fn(async () => 0)
      },
      moderationAction: {
        findMany: vi.fn(async () => []),
        create: vi.fn()
      },
      listing: {
        findMany: vi.fn(async () => []),
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(),
        updateMany: vi.fn(async () => ({ count: 0 })),
        count: vi.fn(async () => 0)
      },
      collection: {
        findMany: vi.fn(async () => []),
        updateMany: vi.fn(async () => ({ count: 0 })),
        upsert: vi.fn(async () => ({ id: "col_1" })),
        count: vi.fn(async () => 0)
      },
      token: {
        upsert: vi.fn(),
        findMany: vi.fn(async () => []),
        count: vi.fn(async () => 0)
      },
      offer: {
        findMany: offerFindMany,
        count: vi.fn(async () => 1)
      },
      $queryRawUnsafe: createSchemaQueryMock({ offerTable: true, tokenHoldingTable: true })
    } as unknown as PrismaClient;

    const createRequestHandler = await loadCreateRequestHandler();
    const handler = createRequestHandler(
      {
        prisma,
        getClientIpImpl: () => "127.0.0.1",
        isRateLimitedImpl: () => false
      },
      {
        chainId: 11155111,
        rpcUrl: "http://127.0.0.1:8545",
        adminToken: "",
        adminAllowlist: new Set(),
        trustProxy: false,
        marketplaceAddress: null,
        marketplaceV2Address: null,
        registryAddress: null,
        moderatorRegistryAddress: null
      }
    );

    const [offersReceivedResponse, healthResponse] = await Promise.all([
      runHandler(handler, createReq({ method: "GET", url: `/api/users/${ownerAddress}/offers-received?cursor=0&limit=10` })),
      runHandler(handler, createReq({ method: "GET", url: "/health" }))
    ]);

    expect(offersReceivedResponse.status).toBe(200);
    expect(offersReceivedResponse.body.items[0]).toMatchObject({
      offerId: "12",
      currentOwnerAddress: ownerAddress,
      currentOwnerAddresses: [ownerAddress, secondaryOwnerAddress]
    });
    expect(offerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          active: true,
          token: {
            is: {
              OR: [
                { ownerAddress },
                {
                  holdings: {
                    some: {
                      ownerAddress
                    }
                  }
                }
              ]
            }
          }
        }
      })
    );
    expect(healthResponse.status).toBe(200);
    expect(healthResponse.body.schema.tokenHoldingTableAvailable).toBe(true);
  });

  it("returns owner holdings with holder-specific balances", async () => {
    const ownerAddress = "0x1111111111111111111111111111111111111111";
    const otherSellerAddress = "0x9999999999999999999999999999999999999999";
    const tokenFindMany = vi.fn(async () => [
      {
        id: "tok_1",
        tokenId: "7",
        creatorAddress: "0x2222222222222222222222222222222222222222",
        ownerAddress: "0x2222222222222222222222222222222222222222",
        mintTxHash: "0xabc",
        draftName: "Edition Seven",
        draftDescription: "Held through indexed balances",
        mintedAmountRaw: "25",
        metadataCid: "ipfs://metadata",
        mediaCid: "ipfs://media",
        immutable: true,
        mintedAt: new Date("2026-03-06T12:00:00.000Z"),
        holdings: [{ ownerAddress, quantityRaw: "2" }],
        collection: {
          chainId: 11155111,
          contractAddress: "0x3333333333333333333333333333333333333333",
          ownerAddress: "0x2222222222222222222222222222222222222222",
          ensSubname: "artist",
          standard: "ERC1155",
          isFactoryCreated: true,
          isUpgradeable: false,
          finalizedAt: null,
          createdAt: new Date("2026-03-06T12:00:00.000Z"),
          updatedAt: new Date("2026-03-06T12:00:00.000Z")
        },
        listings: [
          {
            listingId: "v2:11",
            sellerAddress: ownerAddress,
            paymentToken: "0x0000000000000000000000000000000000000000",
            priceRaw: "10000000000000000",
            amountRaw: "1",
            standard: "ERC1155",
            expiresAtRaw: "2000000000",
            active: true,
            createdAt: new Date("2026-03-06T12:00:00.000Z"),
            updatedAt: new Date("2026-03-06T12:00:00.000Z"),
            lastSyncedAt: new Date("2026-03-06T12:00:00.000Z")
          },
          {
            listingId: "v2:12",
            sellerAddress: otherSellerAddress,
            paymentToken: "0x0000000000000000000000000000000000000000",
            priceRaw: "20000000000000000",
            amountRaw: "4",
            standard: "ERC1155",
            expiresAtRaw: "2000000000",
            active: true,
            createdAt: new Date("2026-03-06T12:00:00.000Z"),
            updatedAt: new Date("2026-03-06T12:00:00.000Z"),
            lastSyncedAt: new Date("2026-03-06T12:00:00.000Z")
          }
        ]
      }
    ]);

    const prisma = {
      report: {
        findMany: vi.fn(async () => []),
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        count: vi.fn(async () => 0)
      },
      moderationAction: {
        findMany: vi.fn(async () => []),
        create: vi.fn()
      },
      listing: {
        findMany: vi.fn(async () => []),
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(),
        updateMany: vi.fn(async () => ({ count: 0 })),
        count: vi.fn(async () => 0)
      },
      collection: {
        findMany: vi.fn(async () => []),
        updateMany: vi.fn(async () => ({ count: 0 })),
        upsert: vi.fn(async () => ({ id: "col_1" })),
        count: vi.fn(async () => 0)
      },
      token: {
        upsert: vi.fn(),
        findMany: tokenFindMany,
        count: vi.fn(async () => 0)
      },
      offer: {
        findMany: vi.fn(async () => []),
        count: vi.fn(async () => 0)
      },
      $queryRawUnsafe: createSchemaQueryMock({
        mintTxHash: true,
        tokenPresentation: true,
        listingV2: true,
        tokenHoldingTable: true,
        offerTable: false
      })
    } as unknown as PrismaClient;

    const createRequestHandler = await loadCreateRequestHandler();
    const handler = createRequestHandler(
      {
        prisma,
        getClientIpImpl: () => "127.0.0.1",
        isRateLimitedImpl: () => false
      },
      {
        chainId: 11155111,
        rpcUrl: "http://127.0.0.1:8545",
        adminToken: "",
        adminAllowlist: new Set(),
        trustProxy: false,
        marketplaceAddress: null,
        marketplaceV2Address: null,
        registryAddress: null,
        moderatorRegistryAddress: null
      }
    );

    const response = await runHandler(
      handler,
      createReq({ method: "GET", url: `/api/users/${ownerAddress}/holdings?cursor=0&limit=10&standard=ERC1155` })
    );

    expect(response.status).toBe(200);
    expect(response.body.items[0]).toMatchObject({
      tokenId: "7",
      ownerAddress,
      heldAmountRaw: "2",
      reservedAmountRaw: "1",
      availableAmountRaw: "1",
      mintedAmountRaw: "25",
      draftName: "Edition Seven",
      activeListing: {
        listingId: "11",
        listingRecordId: "v2:11",
        sellerAddress: ownerAddress
      }
    });
    expect(tokenFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              OR: [
                { ownerAddress },
                {
                  holdings: {
                    some: {
                      ownerAddress
                    }
                  }
                }
              ]
            },
            {
              collection: {
                is: {
                  standard: "ERC1155"
                }
              }
            }
          ]
        },
        select: expect.objectContaining({
          listings: expect.objectContaining({
            where: expect.objectContaining({ active: true, sellerAddress: ownerAddress }),
            take: 50
          })
        })
      })
    );
  });

  it("includes holdings-owned tokens and received offers in owner summaries", async () => {
    const ownerAddress = "0x1111111111111111111111111111111111111111";
    const primaryOwnerAddress = "0x2222222222222222222222222222222222222222";
    const collectionAddress = "0x3333333333333333333333333333333333333333";
    const otherSellerAddress = "0x9999999999999999999999999999999999999999";
    const tokenRow = {
      id: "tok_1",
      tokenId: "7",
      creatorAddress: primaryOwnerAddress,
      ownerAddress: primaryOwnerAddress,
      draftName: "Edition Seven",
      draftDescription: "Held through indexed balances",
      mintedAmountRaw: "25",
      metadataCid: "ipfs://metadata",
      mediaCid: "ipfs://media",
      mintedAt: new Date("2026-03-06T12:00:00.000Z"),
      holdings: [{ ownerAddress, quantityRaw: "2" }],
      listings: [
        {
          listingId: "v2:21",
          sellerAddress: ownerAddress,
          paymentToken: "0x0000000000000000000000000000000000000000",
          priceRaw: "10000000000000000",
          amountRaw: "1",
          standard: "ERC1155",
          expiresAtRaw: "2000000000",
          active: true,
          createdAt: new Date("2026-03-06T12:00:00.000Z"),
          updatedAt: new Date("2026-03-06T12:00:00.000Z"),
          lastSyncedAt: new Date("2026-03-06T12:00:00.000Z")
        },
        {
          listingId: "v2:22",
          sellerAddress: otherSellerAddress,
          paymentToken: "0x0000000000000000000000000000000000000000",
          priceRaw: "10000000000000000",
          amountRaw: "5",
          standard: "ERC1155",
          expiresAtRaw: "2000000000",
          active: true,
          createdAt: new Date("2026-03-06T12:00:00.000Z"),
          updatedAt: new Date("2026-03-06T12:00:00.000Z"),
          lastSyncedAt: new Date("2026-03-06T12:00:00.000Z")
        }
      ],
      collection: {
        contractAddress: collectionAddress,
        ensSubname: "artist",
        standard: "ERC1155",
        isFactoryCreated: true
      }
    };
    const offerRow = {
      id: "offer_row_1",
      offerId: "12",
      chainId: 11155111,
      marketplaceVersion: "v2",
      collectionAddress,
      tokenId: "7",
      buyerAddress: "0x9999999999999999999999999999999999999999",
      paymentToken: "0x0000000000000000000000000000000000000000",
      quantityRaw: "2",
      priceRaw: "10000000000000000",
      expiresAtRaw: "2000000000",
      status: "active",
      active: true,
      acceptedByAddress: null,
      acceptedSellerAddress: null,
      acceptedTxHash: null,
      cancelledTxHash: null,
      createdAt: new Date("2026-03-06T12:00:00.000Z"),
      updatedAt: new Date("2026-03-06T12:00:00.000Z"),
      lastSyncedAt: new Date("2026-03-06T12:00:00.000Z"),
      token: {
        ownerAddress: primaryOwnerAddress,
        holdings: [{ ownerAddress, quantityRaw: "2" }],
        collection: {
          standard: "ERC1155"
        }
      }
    };

    const tokenCount = vi.fn(async (args?: any) => {
      if (args?.where?.OR) return 1;
      if (args?.where?.creatorAddress === ownerAddress) return 0;
      return 0;
    });
    const tokenFindMany = vi.fn(async (args?: any) => {
      if (args?.where?.OR) return [tokenRow];
      return [];
    });
    const offerCount = vi.fn(async (args?: any) => {
      if (args?.where?.buyerAddress === ownerAddress) return 0;
      if (args?.where?.token?.is?.OR) return 1;
      return 0;
    });
    const offerFindMany = vi.fn(async (args?: any) => {
      if (args?.where?.buyerAddress === ownerAddress) return [];
      if (args?.where?.token?.is?.OR || Array.isArray(args?.where?.OR)) return [offerRow];
      return [];
    });

    const prisma = {
      report: {
        findMany: vi.fn(async () => []),
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        count: vi.fn(async () => 0)
      },
      moderationAction: {
        findMany: vi.fn(async () => []),
        create: vi.fn()
      },
      listing: {
        findMany: vi.fn(async () => []),
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(),
        updateMany: vi.fn(async () => ({ count: 0 })),
        count: vi.fn(async () => 0)
      },
      collection: {
        findMany: vi.fn(async () => []),
        updateMany: vi.fn(async () => ({ count: 0 })),
        upsert: vi.fn(async () => ({ id: "col_1" })),
        count: vi.fn(async () => 0)
      },
      token: {
        upsert: vi.fn(),
        findMany: tokenFindMany,
        count: tokenCount
      },
      offer: {
        findMany: offerFindMany,
        count: offerCount
      },
      $queryRawUnsafe: createSchemaQueryMock({
        offerTable: true,
        tokenPresentation: true,
        tokenHoldingTable: true,
        listingV2: true
      })
    } as unknown as PrismaClient;

    const createRequestHandler = await loadCreateRequestHandler();
    const handler = createRequestHandler(
      {
        prisma,
        getClientIpImpl: () => "127.0.0.1",
        isRateLimitedImpl: () => false
      },
      {
        chainId: 11155111,
        rpcUrl: "http://127.0.0.1:8545",
        adminToken: "",
        adminAllowlist: new Set(),
        trustProxy: false,
        marketplaceAddress: null,
        marketplaceV2Address: null,
        registryAddress: null,
        moderatorRegistryAddress: null
      }
    );

    const response = await runHandler(handler, createReq({ method: "GET", url: `/api/owners/${ownerAddress}/summary` }));

    expect(response.status).toBe(200);
    expect(response.body.counts).toMatchObject({
      ownedTokens: 1,
      offersReceived: 1
    });
    expect(response.body.recentOwnedMints[0]).toMatchObject({
      tokenId: "7",
      ownerAddress,
      heldAmountRaw: "2",
      reservedAmountRaw: "1",
      availableAmountRaw: "1",
      draftName: "Edition Seven",
      activeListing: {
        listingId: "21",
        listingRecordId: "v2:21",
        sellerAddress: ownerAddress
      }
    });
    expect(response.body.recentOffersReceived[0]).toMatchObject({
      offerId: "12",
      currentOwnerAddress: ownerAddress,
      currentOwnerAddresses: [ownerAddress]
    });
    expect(tokenCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { ownerAddress },
            {
              holdings: {
                some: {
                  ownerAddress
                }
              }
            }
          ]
        }
      })
    );
    expect(tokenFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          listings: expect.objectContaining({
            where: expect.objectContaining({ active: true, sellerAddress: ownerAddress }),
            take: 50
          })
        })
      })
    );
  });

  it("exposes registry addresses through health without admin auth", async () => {
    const prisma = {
      report: {
        findMany: vi.fn(async () => []),
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        count: vi.fn(async () => 0)
      },
      moderationAction: {
        findMany: vi.fn(async () => []),
        create: vi.fn()
      },
      listing: {
        findMany: vi.fn(async () => []),
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(),
        updateMany: vi.fn(async () => ({ count: 0 })),
        count: vi.fn(async () => 0)
      },
      collection: {
        findMany: vi.fn(async () => []),
        updateMany: vi.fn(async () => ({ count: 0 })),
        upsert: vi.fn(async () => ({ id: "col_1" })),
        count: vi.fn(async () => 0)
      },
      token: {
        upsert: vi.fn(),
        findMany: vi.fn(async () => []),
        count: vi.fn(async () => 0)
      },
      $queryRawUnsafe: createSchemaQueryMock()
    } as unknown as PrismaClient;

    const createRequestHandler = await loadCreateRequestHandler();
    const handler = createRequestHandler(
      {
        prisma,
        getClientIpImpl: () => "127.0.0.1",
        isRateLimitedImpl: () => false
      },
      {
        chainId: 11155111,
        rpcUrl: "http://127.0.0.1:8545",
        adminToken: "",
        adminAllowlist: new Set(),
        trustProxy: false,
        marketplaceAddress: null,
        marketplaceV2Address: null,
        registryAddress: "0x1111111111111111111111111111111111111111",
        moderatorRegistryAddress: "0x2222222222222222222222222222222222222222"
      }
    );

    const healthResponse = await runHandler(handler, createReq({ method: "GET", url: "/health" }));

    expect(healthResponse.status).toBe(200);
    expect(healthResponse.body.contracts).toMatchObject({
      registryAddress: "0x1111111111111111111111111111111111111111",
      moderatorRegistryAddress: "0x2222222222222222222222222222222222222222"
    });
  });

  it("stores and reuses listing-scoped moderation refs when moderation columns are available", async () => {
    const listingFindMany = vi.fn(async () => [
      {
        listingId: "v2:9",
        marketplaceVersion: "v2",
        sellerAddress: "0x1111111111111111111111111111111111111111",
        collectionAddress: "0x2222222222222222222222222222222222222222",
        tokenId: "7",
        amountRaw: "1",
        standard: "ERC721",
        paymentToken: "0x0000000000000000000000000000000000000000",
        priceRaw: "100",
        expiresAtRaw: "2000000000",
        active: false,
        buyerAddress: "0x5555555555555555555555555555555555555555",
        txHash: "0xabc",
        cancelledAt: null,
        soldAt: new Date("2026-03-06T12:20:00.000Z"),
        lastSyncedAt: new Date("2026-03-06T12:20:00.000Z"),
        createdAt: new Date("2026-03-06T12:00:00.000Z"),
        updatedAt: new Date("2026-03-06T12:20:00.000Z"),
        token: {
          id: "tok_1",
          creatorAddress: "0x1111111111111111111111111111111111111111",
          ownerAddress: "0x5555555555555555555555555555555555555555",
          holdings: [],
          metadataCid: "ipfs://metadata",
          mediaCid: "ipfs://media",
          immutable: true,
          mintedAt: new Date("2026-03-06T12:00:00.000Z"),
          mintTxHash: "0xmint",
          draftName: "Moderated Token",
          draftDescription: "Historical listing snapshot",
          mintedAmountRaw: "1",
          collection: {
            chainId: 11155111,
            contractAddress: "0x2222222222222222222222222222222222222222",
            ownerAddress: "0x1111111111111111111111111111111111111111",
            ensSubname: "artist",
            standard: "ERC721",
            isFactoryCreated: true,
            isUpgradeable: false,
            finalizedAt: null,
            createdAt: new Date("2026-03-06T12:00:00.000Z"),
            updatedAt: new Date("2026-03-06T12:00:00.000Z")
          },
          listings: []
        }
      }
    ]);
    const reportCreate = vi.fn(async () => ({
      id: "rep_1",
      status: "open",
      createdAt: new Date("2026-03-06T12:00:00.000Z")
    }));
    const reportFindMany = vi.fn(async () => [
      {
        id: "rep_1",
        tokenId: "tok_1",
        listingRecordId: "v2:9",
        marketplaceVersion: "v2",
        reporterAddress: "0x4444444444444444444444444444444444444444",
        reason: "spam",
        evidence: null,
        status: "open",
        createdAt: new Date("2026-03-06T12:00:00.000Z"),
        updatedAt: new Date("2026-03-06T12:05:00.000Z"),
        token: {
          listings: [
            {
              listingId: "12",
              marketplaceVersion: "v1",
              sellerAddress: "0x1111111111111111111111111111111111111111",
              paymentToken: "0x0000000000000000000000000000000000000000",
              priceRaw: "100",
              amountRaw: "1",
              standard: "ERC721",
              expiresAtRaw: "2000000000",
              active: true,
              createdAt: new Date("2026-03-06T12:00:00.000Z"),
              updatedAt: new Date("2026-03-06T12:00:00.000Z"),
              lastSyncedAt: new Date("2026-03-06T12:00:00.000Z")
            }
          ]
        }
      }
    ]);
    const reportFindUnique = vi.fn(async () => ({
      id: "rep_1",
      tokenId: "tok_1",
      listingRecordId: "v2:9",
      marketplaceVersion: "v2"
    }));
    const moderationActionCreate = vi.fn(async () => ({ id: "act_new" }));
    const moderationActionFindMany = vi.fn(async () => [
      {
        id: "act_1",
        tokenId: "tok_1",
        listingRecordId: "v2:9",
        marketplaceVersion: "v2",
        reportId: "rep_1",
        action: "hide",
        actor: "admin",
        notes: null,
        createdAt: new Date("2026-03-06T12:10:00.000Z"),
        token: {
          listings: [
            {
              listingId: "12",
              marketplaceVersion: "v1",
              sellerAddress: "0x1111111111111111111111111111111111111111",
              paymentToken: "0x0000000000000000000000000000000000000000",
              priceRaw: "100",
              amountRaw: "1",
              standard: "ERC721",
              expiresAtRaw: "2000000000",
              active: true,
              createdAt: new Date("2026-03-06T12:00:00.000Z"),
              updatedAt: new Date("2026-03-06T12:00:00.000Z"),
              lastSyncedAt: new Date("2026-03-06T12:00:00.000Z")
            }
          ]
        }
      }
    ]);

    const prisma = {
      report: {
        findMany: reportFindMany,
        create: reportCreate,
        findUnique: reportFindUnique,
        update: vi.fn(async () => ({ id: "rep_1" })),
        count: vi.fn(async () => 0)
      },
      moderationAction: {
        findMany: moderationActionFindMany,
        create: moderationActionCreate
      },
      listing: {
        findMany: listingFindMany,
        findUnique: vi.fn(async () => ({ tokenRefId: "tok_1", listingId: "v2:9" })),
        upsert: vi.fn(async () => ({ id: "listing_1" })),
        updateMany: vi.fn(async () => ({ count: 0 })),
        count: vi.fn(async () => 0)
      },
      collection: {
        findMany: vi.fn(async () => []),
        updateMany: vi.fn(async () => ({ count: 0 })),
        upsert: vi.fn(async () => ({ id: "col_1" })),
        count: vi.fn(async () => 0)
      },
      token: {
        upsert: vi.fn(async () => ({ id: "tok_1" })),
        findMany: vi.fn(async () => []),
        count: vi.fn(async () => 0)
      },
      $queryRawUnsafe: createSchemaQueryMock({ listingV2: true, moderationListing: true })
    } as unknown as PrismaClient;

    const createRequestHandler = await loadCreateRequestHandler();
    const handler = createRequestHandler(
      {
        prisma,
        getClientIpImpl: () => "127.0.0.1",
        isRateLimitedImpl: () => false
      },
      {
        chainId: 11155111,
        rpcUrl: "http://127.0.0.1:8545",
        adminToken: "secret",
        adminAllowlist: new Set(),
        trustProxy: false,
        marketplaceAddress: null,
        marketplaceV2Address: null,
        registryAddress: null,
        moderatorRegistryAddress: null
      }
    );

    const createResponse = await runHandler(
      handler,
      createReq({
        method: "POST",
        url: "/api/moderation/reports",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          listingRecordId: "v2:9",
          marketplaceVersion: "v2",
          collectionAddress: "0x2222222222222222222222222222222222222222",
          tokenId: "7",
          sellerAddress: "0x1111111111111111111111111111111111111111",
          standard: "ERC721",
          reporterAddress: "0x4444444444444444444444444444444444444444",
          reason: "spam"
        })
      })
    );

    expect(createResponse.status).toBe(201);
    expect(reportCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tokenId: "tok_1",
          listingRecordId: "v2:9",
          marketplaceVersion: "v2"
        })
      })
    );

    const resolveResponse = await runHandler(
      handler,
      createReq({
        method: "POST",
        url: "/api/moderation/reports/rep_1/resolve",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer secret"
        },
        body: JSON.stringify({
          action: "hide",
          actor: "admin"
        })
      })
    );

    expect(resolveResponse.status).toBe(200);
    expect(moderationActionCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          tokenId: "tok_1",
          listingRecordId: "v2:9",
          marketplaceVersion: "v2",
          reportId: "rep_1",
          action: "hide"
        })
      })
    );

    const [reportsResponse, actionsResponse, hiddenResponse] = await Promise.all([
      runHandler(handler, createReq({ method: "GET", url: "/api/moderation/reports?status=open" })),
      runHandler(handler, createReq({ method: "GET", url: "/api/moderation/actions" })),
      runHandler(handler, createReq({ method: "GET", url: "/api/moderation/hidden-listings" }))
    ]);

    expect(reportsResponse.status).toBe(200);
    expect(reportsResponse.body[0]).toMatchObject({
      listingId: 9,
      listingRecordId: "v2:9",
      marketplaceVersion: "v2",
      listing: {
        listingRecordId: "v2:9",
        marketplaceVersion: "v2",
        active: false,
        soldAt: "2026-03-06T12:20:00.000Z"
      }
    });

    expect(actionsResponse.status).toBe(200);
    expect(actionsResponse.body[0]).toMatchObject({
      listingId: 9,
      listingRecordId: "v2:9",
      marketplaceVersion: "v2",
      listing: {
        listingRecordId: "v2:9",
        marketplaceVersion: "v2",
        active: false,
        soldAt: "2026-03-06T12:20:00.000Z"
      }
    });

    expect(hiddenResponse.status).toBe(200);
    expect(hiddenResponse.body).toMatchObject({
      listingIds: [9],
      listingRecordIds: ["v2:9"]
    });

    const visibilityResponse = await runHandler(
      handler,
      createReq({
        method: "POST",
        url: "/api/moderation/listings/v2%3A9/visibility",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer secret"
        },
        body: JSON.stringify({
          hidden: true,
          actor: "admin"
        })
      })
    );

    expect(visibilityResponse.status).toBe(200);
    expect(moderationActionCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          tokenId: "tok_1",
          listingRecordId: "v2:9",
          marketplaceVersion: "v2",
          action: "hide"
        })
      })
    );
  });

  it("keeps legacy token-scoped moderation rows readable while new listing-scoped rows coexist", async () => {
    const prisma = {
      report: {
        findMany: vi.fn(async () => []),
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        count: vi.fn(async () => 0)
      },
      moderationAction: {
        findMany: vi.fn(async () => [
          {
            tokenId: "tok_legacy",
            action: "hide",
            listingRecordId: null
          },
          {
            tokenId: "tok_new",
            action: "hide",
            listingRecordId: "v2:9"
          }
        ]),
        create: vi.fn()
      },
      listing: {
        findMany: vi.fn(async () => [{ listingId: "12" }]),
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(),
        updateMany: vi.fn(async () => ({ count: 0 })),
        count: vi.fn(async () => 0)
      },
      collection: {
        findMany: vi.fn(async () => []),
        updateMany: vi.fn(async () => ({ count: 0 })),
        upsert: vi.fn(async () => ({ id: "col_1" })),
        count: vi.fn(async () => 0)
      },
      token: {
        upsert: vi.fn(),
        findMany: vi.fn(async () => []),
        count: vi.fn(async () => 0)
      },
      $queryRawUnsafe: createSchemaQueryMock({ moderationListing: true })
    } as unknown as PrismaClient;

    const createRequestHandler = await loadCreateRequestHandler();
    const handler = createRequestHandler(
      {
        prisma,
        getClientIpImpl: () => "127.0.0.1",
        isRateLimitedImpl: () => false
      },
      {
        chainId: 11155111,
        rpcUrl: "http://127.0.0.1:8545",
        adminToken: "",
        adminAllowlist: new Set(),
        trustProxy: false,
        marketplaceAddress: null,
        marketplaceV2Address: null,
        registryAddress: null,
        moderatorRegistryAddress: null
      }
    );

    const hiddenResponse = await runHandler(handler, createReq({ method: "GET", url: "/api/moderation/hidden-listings" }));

    expect(hiddenResponse.status).toBe(200);
    expect(hiddenResponse.body).toMatchObject({
      listingIds: [9, 12],
      listingRecordIds: ["12", "v2:9"]
    });
  });

  it("resolves ENS route slugs through linked profiles and collection identities", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "nftfactory-indexer-profile-"));
    vi.stubEnv("INDEXER_PROFILE_FILE", path.join(tempDir, "profiles.json"));
    await writeFile(
      path.join(tempDir, "profiles.json"),
      JSON.stringify([
        {
          slug: "eth.artist",
          fullName: "artist.eth",
          ownerAddress: "0x1111111111111111111111111111111111111111",
          source: "ens",
          routeSlug: "eth.artist",
          linkedAt: "2026-03-10T12:00:00.000Z",
          collectionAddress: "0x2222222222222222222222222222222222222222"
        }
      ]),
      "utf8"
    );

    const prisma = {
      report: {
        findMany: vi.fn(async () => []),
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        count: vi.fn(async () => 0)
      },
      moderationAction: {
        findMany: vi.fn(async () => []),
        create: vi.fn()
      },
      listing: {
        findMany: vi.fn(async () => []),
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(),
        updateMany: vi.fn(async () => ({ count: 0 })),
        count: vi.fn(async () => 0)
      },
      collection: {
        findMany: vi.fn(async ({ where }: any) => {
          if (where?.OR?.some((item: any) => item.ensSubname === "artist.eth")) {
            return [
              {
                ownerAddress: "0x1111111111111111111111111111111111111111",
                ensSubname: "artist.eth",
                contractAddress: "0x2222222222222222222222222222222222222222"
              }
            ];
          }
          return [];
        }),
        updateMany: vi.fn(async () => ({ count: 0 })),
        upsert: vi.fn(async () => ({ id: "col_1" })),
        count: vi.fn(async () => 0)
      },
      token: {
        upsert: vi.fn(),
        findMany: vi.fn(async () => []),
        count: vi.fn(async () => 0)
      },
      $queryRawUnsafe: createSchemaQueryMock()
    } as unknown as PrismaClient;

    const createRequestHandler = await loadCreateRequestHandler();
    const handler = createRequestHandler(
      {
        prisma,
        getClientIpImpl: () => "127.0.0.1",
        isRateLimitedImpl: () => false
      },
      {
        chainId: 11155111,
        rpcUrl: "http://127.0.0.1:8545",
        adminToken: "",
        adminAllowlist: new Set(),
        trustProxy: false,
        marketplaceAddress: null,
        marketplaceV2Address: null,
        registryAddress: null,
        moderatorRegistryAddress: null
      }
    );

    const response = await runHandler(handler, createReq({ method: "GET", url: "/api/profile/eth.artist" }));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      name: "eth.artist",
      sellers: ["0x1111111111111111111111111111111111111111"]
    });
    expect(response.body.profiles).toHaveLength(1);
    expect(response.body.profiles[0]).toMatchObject({
      slug: "eth.artist",
      fullName: "artist.eth",
      source: "ens"
    });
    expect(response.body.collections).toEqual([
      {
        ensSubname: "artist.eth",
        contractAddress: "0x2222222222222222222222222222222222222222",
        ownerAddress: "0x1111111111111111111111111111111111111111"
      }
    ]);
  });

  it("persists collection ENS identity when linking a profile to an indexed collection", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "nftfactory-indexer-link-"));
    vi.stubEnv("INDEXER_PROFILE_FILE", path.join(tempDir, "profiles.json"));

    const collectionFindMany = vi.fn(async () => [
      {
        contractAddress: "0x2222222222222222222222222222222222222222",
        ownerAddress: "0x1111111111111111111111111111111111111111"
      }
    ]);
    const collectionUpdateMany = vi.fn(async () => ({ count: 1 }));

    const prisma = {
      report: {
        findMany: vi.fn(async () => []),
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        count: vi.fn(async () => 0)
      },
      moderationAction: {
        findMany: vi.fn(async () => []),
        create: vi.fn()
      },
      listing: {
        findMany: vi.fn(async () => []),
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(),
        updateMany: vi.fn(async () => ({ count: 0 })),
        count: vi.fn(async () => 0)
      },
      collection: {
        findMany: collectionFindMany,
        updateMany: collectionUpdateMany,
        upsert: vi.fn(async () => ({ id: "col_1" })),
        count: vi.fn(async () => 0)
      },
      token: {
        upsert: vi.fn(),
        findMany: vi.fn(async () => []),
        count: vi.fn(async () => 0)
      },
      $queryRawUnsafe: createSchemaQueryMock()
    } as unknown as PrismaClient;

    const createRequestHandler = await loadCreateRequestHandler();
    const handler = createRequestHandler(
      {
        prisma,
        getClientIpImpl: () => "127.0.0.1",
        isRateLimitedImpl: () => false
      },
      {
        chainId: 11155111,
        rpcUrl: "http://127.0.0.1:8545",
        adminToken: "",
        adminAllowlist: new Set(),
        trustProxy: false,
        marketplaceAddress: null,
        marketplaceV2Address: null,
        registryAddress: null,
        moderatorRegistryAddress: null
      }
    );

    const response = await runHandler(
      handler,
      createReq({
        method: "POST",
        url: "/api/profiles/link",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "artist.eth",
          source: "ens",
          ownerAddress: "0x1111111111111111111111111111111111111111",
          routeSlug: "eth.artist",
          collectionAddress: "0x2222222222222222222222222222222222222222"
        })
      })
    );

    expect(response.status).toBe(200);
    expect(collectionFindMany).toHaveBeenCalledWith({
      where: { contractAddress: "0x2222222222222222222222222222222222222222" },
      select: { contractAddress: true, ownerAddress: true },
      take: 1
    });
    expect(collectionUpdateMany).toHaveBeenCalledWith({
      where: {
        contractAddress: "0x2222222222222222222222222222222222222222",
        ownerAddress: "0x1111111111111111111111111111111111111111"
      },
      data: { ensSubname: "artist.eth" }
    });
    expect(response.body.profile).toMatchObject({
      slug: "eth.artist",
      fullName: "artist.eth",
      collectionAddress: "0x2222222222222222222222222222222222222222"
    });
  });

  it("rejects profile collection attachment when the collection is not indexed yet", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "nftfactory-indexer-link-missing-"));
    vi.stubEnv("INDEXER_PROFILE_FILE", path.join(tempDir, "profiles.json"));

    const collectionFindMany = vi.fn(async () => []);
    const collectionUpdateMany = vi.fn(async () => ({ count: 0 }));

    const prisma = {
      report: {
        findMany: vi.fn(async () => []),
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        count: vi.fn(async () => 0)
      },
      moderationAction: {
        findMany: vi.fn(async () => []),
        create: vi.fn()
      },
      listing: {
        findMany: vi.fn(async () => []),
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(),
        updateMany: vi.fn(async () => ({ count: 0 })),
        count: vi.fn(async () => 0)
      },
      collection: {
        findMany: collectionFindMany,
        updateMany: collectionUpdateMany,
        upsert: vi.fn(async () => ({ id: "col_1" })),
        count: vi.fn(async () => 0)
      },
      token: {
        upsert: vi.fn(),
        findMany: vi.fn(async () => []),
        count: vi.fn(async () => 0)
      },
      $queryRawUnsafe: createSchemaQueryMock()
    } as unknown as PrismaClient;

    const createRequestHandler = await loadCreateRequestHandler();
    const handler = createRequestHandler(
      {
        prisma,
        getClientIpImpl: () => "127.0.0.1",
        isRateLimitedImpl: () => false
      },
      {
        chainId: 11155111,
        rpcUrl: "http://127.0.0.1:8545",
        adminToken: "",
        adminAllowlist: new Set(),
        trustProxy: false,
        marketplaceAddress: null,
        marketplaceV2Address: null,
        registryAddress: null,
        moderatorRegistryAddress: null
      }
    );

    const response = await runHandler(
      handler,
      createReq({
        method: "POST",
        url: "/api/profiles/link",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "artist.eth",
          source: "ens",
          ownerAddress: "0x1111111111111111111111111111111111111111",
          routeSlug: "eth.artist",
          collectionAddress: "0x2222222222222222222222222222222222222222"
        })
      })
    );

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      error: "The selected collection is not indexed yet. Retry after the indexer syncs it."
    });
    expect(collectionUpdateMany).not.toHaveBeenCalled();
  });

  it("stores bare nftfactory labels on the collection when linking nftfactory subnames", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "nftfactory-indexer-link-nftfactory-"));
    vi.stubEnv("INDEXER_PROFILE_FILE", path.join(tempDir, "profiles.json"));

    const collectionFindMany = vi.fn(async () => [
      {
        contractAddress: "0x2222222222222222222222222222222222222222",
        ownerAddress: "0x1111111111111111111111111111111111111111"
      }
    ]);
    const collectionUpdateMany = vi.fn(async () => ({ count: 1 }));

    const prisma = {
      report: {
        findMany: vi.fn(async () => []),
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        count: vi.fn(async () => 0)
      },
      moderationAction: {
        findMany: vi.fn(async () => []),
        create: vi.fn()
      },
      listing: {
        findMany: vi.fn(async () => []),
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(),
        updateMany: vi.fn(async () => ({ count: 0 })),
        count: vi.fn(async () => 0)
      },
      collection: {
        findMany: collectionFindMany,
        updateMany: collectionUpdateMany,
        upsert: vi.fn(async () => ({ id: "col_1" })),
        count: vi.fn(async () => 0)
      },
      token: {
        upsert: vi.fn(),
        findMany: vi.fn(async () => []),
        count: vi.fn(async () => 0)
      },
      $queryRawUnsafe: createSchemaQueryMock()
    } as unknown as PrismaClient;

    const createRequestHandler = await loadCreateRequestHandler();
    const handler = createRequestHandler(
      {
        prisma,
        getClientIpImpl: () => "127.0.0.1",
        isRateLimitedImpl: () => false
      },
      {
        chainId: 11155111,
        rpcUrl: "http://127.0.0.1:8545",
        adminToken: "",
        adminAllowlist: new Set(),
        trustProxy: false,
        marketplaceAddress: null,
        marketplaceV2Address: null,
        registryAddress: null,
        moderatorRegistryAddress: null
      }
    );

    const response = await runHandler(
      handler,
      createReq({
        method: "POST",
        url: "/api/profiles/link",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "artist",
          source: "nftfactory-subname",
          ownerAddress: "0x1111111111111111111111111111111111111111",
          routeSlug: "artist",
          collectionAddress: "0x2222222222222222222222222222222222222222"
        })
      })
    );

    expect(response.status).toBe(200);
    expect(collectionUpdateMany).toHaveBeenCalledWith({
      where: {
        contractAddress: "0x2222222222222222222222222222222222222222",
        ownerAddress: "0x1111111111111111111111111111111111111111"
      },
      data: { ensSubname: "artist" }
    });
    expect(response.body.profile).toMatchObject({
      slug: "artist",
      fullName: "artist.nftfactory.eth",
      source: "nftfactory-subname"
    });
  });
});
