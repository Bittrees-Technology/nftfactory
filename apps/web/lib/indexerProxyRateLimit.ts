import type { RequestRateLimitConfig } from "./requestRateLimit";
import { resolveRequestRateLimitConfig } from "./requestRateLimit";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isIndexerProxyWriteMethod(method: string): boolean {
  return WRITE_METHODS.has(String(method || "").trim().toUpperCase());
}

export function resolveIndexerProxyWriteRateLimitConfig(
  env: Record<string, string | undefined>
): RequestRateLimitConfig {
  return {
    bucket: "indexer-proxy-write",
    errorMessage: "Too many indexer proxy write requests. Retry later.",
    ...resolveRequestRateLimitConfig(env, "INDEXER_PROXY_WRITE", {
      maxRequests: 30,
      windowMs: 60_000
    })
  };
}
