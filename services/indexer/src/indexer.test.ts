import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createRequestHandler } from "./indexer.js";

function createMockPrisma(): PrismaClient {
  return {
    report: {
      findMany: vi.fn(async () => []),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn()
    },
    moderationAction: {
      findMany: vi.fn(async () => []),
      create: vi.fn()
    },
    listing: {
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => ({ tokenRefId: "tok_1" })),
      upsert: vi.fn()
    },
    collection: {
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(async () => ({ count: 0 })),
      upsert: vi.fn()
    },
    token: {
      upsert: vi.fn()
    }
  } as unknown as PrismaClient;
}

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
        const parsed = bodyText ? JSON.parse(bodyText) : null;
        resolve({ status: statusCode, body: parsed });
      }
    } as unknown as ServerResponse;

    handler(req, res);
  });
}

describe("indexer handler", () => {
  it("returns 400 for invalid moderation report status query", async () => {
    const handler = createRequestHandler(
      {
        prisma: createMockPrisma(),
        getClientIpImpl: () => "127.0.0.1",
        isRateLimitedImpl: () => false
      },
      {
        chainId: 11155111,
        adminToken: "",
        adminAllowlist: new Set(),
        trustProxy: false
      }
    );

    const response = await runHandler(handler, createReq({ method: "GET", url: "/api/moderation/reports?status=oops" }));
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("Invalid status query");
  });

  it("enforces admin token for visibility mutation", async () => {
    const handler = createRequestHandler(
      {
        prisma: createMockPrisma(),
        getClientIpImpl: () => "127.0.0.1",
        isRateLimitedImpl: () => false
      },
      {
        chainId: 11155111,
        adminToken: "secret-token",
        adminAllowlist: new Set(),
        trustProxy: false
      }
    );

    const response = await runHandler(
      handler,
      createReq({
        method: "POST",
        url: "/api/moderation/listings/42/visibility",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hidden: true, actor: "admin" })
      })
    );

    expect(response.status).toBe(401);
    expect(response.body.error).toContain("invalid admin token");
  });

  it("passes trustProxy=true to getClientIp in write endpoint rate limiting", async () => {
    const seen: boolean[] = [];
    const handler = createRequestHandler(
      {
        prisma: createMockPrisma(),
        getClientIpImpl: (_req, trustProxy) => {
          seen.push(Boolean(trustProxy));
          return "203.0.113.1";
        },
        isRateLimitedImpl: () => true
      },
      {
        chainId: 11155111,
        adminToken: "",
        adminAllowlist: new Set(),
        trustProxy: true
      }
    );

    const response = await runHandler(handler, createReq({ method: "POST", url: "/api/moderation/listings/42/visibility" }));
    expect(response.status).toBe(429);
    expect(response.body.error).toContain("Too many requests");
    expect(seen).toEqual([true]);
  });

  it("passes trustProxy=false to getClientIp in write endpoint rate limiting", async () => {
    const seen: boolean[] = [];
    const handler = createRequestHandler(
      {
        prisma: createMockPrisma(),
        getClientIpImpl: (_req, trustProxy) => {
          seen.push(Boolean(trustProxy));
          return "127.0.0.1";
        },
        isRateLimitedImpl: () => true
      },
      {
        chainId: 11155111,
        adminToken: "",
        adminAllowlist: new Set(),
        trustProxy: false
      }
    );

    const response = await runHandler(handler, createReq({ method: "POST", url: "/api/admin/collections/backfill-subname" }));
    expect(response.status).toBe(429);
    expect(response.body.error).toContain("Too many requests");
    expect(seen).toEqual([false]);
  });
});
