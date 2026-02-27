import type { IncomingMessage } from "node:http";
import { describe, it, expect, beforeEach } from "vitest";
import { getClientIp, isAddress, isZeroAddress, normalizeSubname, parseBearerToken, isRateLimited, resetRateLimits } from "./utils.js";

describe("isAddress", () => {
  it("accepts valid checksummed address", () => {
    expect(isAddress("0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B")).toBe(true);
  });

  it("accepts valid lowercase address", () => {
    expect(isAddress("0xab5801a7d398351b8be11c439e05c5b3259aec9b")).toBe(true);
  });

  it("rejects short address", () => {
    expect(isAddress("0xab5801a7d398")).toBe(false);
  });

  it("rejects address without 0x prefix", () => {
    expect(isAddress("ab5801a7d398351b8be11c439e05c5b3259aec9b")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isAddress("")).toBe(false);
  });

  it("rejects address with invalid characters", () => {
    expect(isAddress("0xZZ5801a7d398351b8be11c439e05c5b3259aec9b")).toBe(false);
  });
});

describe("isZeroAddress", () => {
  it("accepts zero address", () => {
    expect(isZeroAddress("0x0000000000000000000000000000000000000000")).toBe(true);
  });

  it("rejects non-zero address", () => {
    expect(isZeroAddress("0xab5801a7d398351b8be11c439e05c5b3259aec9b")).toBe(false);
  });
});

describe("normalizeSubname", () => {
  it("strips .nftfactory.eth suffix", () => {
    expect(normalizeSubname("alice.nftfactory.eth")).toBe("alice");
  });

  it("lowercases input", () => {
    expect(normalizeSubname("ALICE")).toBe("alice");
  });

  it("trims whitespace", () => {
    expect(normalizeSubname("  alice  ")).toBe("alice");
  });

  it("handles already-normalized input", () => {
    expect(normalizeSubname("alice")).toBe("alice");
  });

  it("handles full suffix with extra whitespace", () => {
    expect(normalizeSubname("  Bob.nftfactory.eth  ")).toBe("bob");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeSubname("")).toBe("");
  });
});

describe("parseBearerToken", () => {
  it("extracts token from valid Bearer header", () => {
    expect(parseBearerToken("Bearer abc123")).toBe("abc123");
  });

  it("is case-insensitive for scheme", () => {
    expect(parseBearerToken("bearer token456")).toBe("token456");
  });

  it("returns empty for missing header", () => {
    expect(parseBearerToken(undefined)).toBe("");
  });

  it("returns empty for empty string", () => {
    expect(parseBearerToken("")).toBe("");
  });

  it("returns empty for malformed header without token", () => {
    expect(parseBearerToken("Bearer")).toBe("");
  });

  it("returns empty for non-Bearer scheme", () => {
    expect(parseBearerToken("Basic abc123")).toBe("");
  });

  it("trims token whitespace", () => {
    expect(parseBearerToken("Bearer  tok  ")).toBe("tok");
  });

  it("handles multiple spaces between scheme and token", () => {
    expect(parseBearerToken("Bearer    token789")).toBe("token789");
  });
});

describe("getClientIp", () => {
  function mockReq(params: {
    forwarded?: string;
    remoteAddress?: string;
  }): IncomingMessage {
    return {
      headers: params.forwarded ? { "x-forwarded-for": params.forwarded } : {},
      socket: { remoteAddress: params.remoteAddress || null }
    } as IncomingMessage;
  }

  it("uses socket remote address by default", () => {
    const req = mockReq({ forwarded: "203.0.113.1", remoteAddress: "127.0.0.1" });
    expect(getClientIp(req)).toBe("127.0.0.1");
  });

  it("uses x-forwarded-for when trustProxy is enabled", () => {
    const req = mockReq({ forwarded: "203.0.113.1, 203.0.113.2", remoteAddress: "127.0.0.1" });
    expect(getClientIp(req, true)).toBe("203.0.113.1");
  });

  it("returns unknown when remote address is unavailable", () => {
    const req = mockReq({});
    expect(getClientIp(req)).toBe("unknown");
  });
});

describe("isRateLimited", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it("allows first request", () => {
    expect(isRateLimited("1.2.3.4")).toBe(false);
  });

  it("allows up to 30 requests", () => {
    for (let i = 0; i < 30; i++) {
      expect(isRateLimited("1.2.3.4")).toBe(false);
    }
  });

  it("blocks request 31", () => {
    for (let i = 0; i < 30; i++) {
      isRateLimited("1.2.3.4");
    }
    expect(isRateLimited("1.2.3.4")).toBe(true);
  });

  it("tracks IPs independently", () => {
    for (let i = 0; i < 30; i++) {
      isRateLimited("1.2.3.4");
    }
    expect(isRateLimited("1.2.3.4")).toBe(true);
    expect(isRateLimited("5.6.7.8")).toBe(false);
  });
});
