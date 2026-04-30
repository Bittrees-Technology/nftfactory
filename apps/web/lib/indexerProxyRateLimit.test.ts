import { describe, expect, it } from "vitest";
import {
  isIndexerProxyWriteMethod,
  resolveIndexerProxyWriteRateLimitConfig
} from "./indexerProxyRateLimit";

describe("indexerProxyRateLimit", () => {
  it("detects app-facing write methods", () => {
    expect(isIndexerProxyWriteMethod("POST")).toBe(true);
    expect(isIndexerProxyWriteMethod(" patch ")).toBe(true);
    expect(isIndexerProxyWriteMethod("GET")).toBe(false);
    expect(isIndexerProxyWriteMethod("HEAD")).toBe(false);
  });

  it("uses sane defaults for the public proxy write limiter", () => {
    expect(resolveIndexerProxyWriteRateLimitConfig({})).toEqual({
      bucket: "indexer-proxy-write",
      errorMessage: "Too many indexer proxy write requests. Retry later.",
      maxRequests: 30,
      windowMs: 60_000
    });
  });

  it("accepts env overrides", () => {
    expect(
      resolveIndexerProxyWriteRateLimitConfig({
        INDEXER_PROXY_WRITE_RATE_LIMIT_MAX_REQUESTS: "12",
        INDEXER_PROXY_WRITE_RATE_LIMIT_WINDOW_MS: "90000"
      })
    ).toEqual({
      bucket: "indexer-proxy-write",
      errorMessage: "Too many indexer proxy write requests. Retry later.",
      maxRequests: 12,
      windowMs: 90_000
    });
  });
});
