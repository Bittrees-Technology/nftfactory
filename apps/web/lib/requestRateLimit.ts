export type RequestRateLimitConfig = {
  bucket: string;
  maxRequests: number;
  windowMs: number;
  errorMessage: string;
};

export type RequestRateLimitResult =
  | {
      error: string;
      headers: Record<string, string>;
      retryAfterSeconds: number;
      status: 429;
    }
  | null;

const CLIENT_IP_HEADER_CANDIDATES = ["cf-connecting-ip", "true-client-ip", "x-real-ip", "x-forwarded-for"] as const;
const MIN_RATE_LIMIT_WINDOW_MS = 1_000;
const MIN_RATE_LIMIT_MAX_REQUESTS = 1;
const PRUNE_INTERVAL = 100;
const PRUNE_SIZE_THRESHOLD = 512;

const requestRateLimitMap = new Map<string, { count: number; resetAt: number }>();
let requestsSinceLastPrune = 0;

function firstForwardedValue(value: string | null | undefined): string | null {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .find(Boolean) || null;
}

function parsePositiveInteger(value: string | undefined, fallback: number, minimum: number): number {
  const normalized = String(value || "").trim();
  if (!/^\d+$/.test(normalized)) {
    return fallback;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    return fallback;
  }

  return parsed;
}

function pruneExpiredEntries(now: number): void {
  requestsSinceLastPrune += 1;
  if (requestsSinceLastPrune < PRUNE_INTERVAL && requestRateLimitMap.size < PRUNE_SIZE_THRESHOLD) {
    return;
  }

  requestsSinceLastPrune = 0;
  for (const [key, entry] of requestRateLimitMap.entries()) {
    if (now >= entry.resetAt) {
      requestRateLimitMap.delete(key);
    }
  }
}

export function getRequestClientIp(request: Pick<Request, "headers">): string {
  for (const headerName of CLIENT_IP_HEADER_CANDIDATES) {
    const value = firstForwardedValue(request.headers.get(headerName));
    if (value) {
      return value;
    }
  }

  return "unknown";
}

export function resolveRequestRateLimitConfig(
  env: Record<string, string | undefined>,
  prefix: string,
  defaults: Pick<RequestRateLimitConfig, "maxRequests" | "windowMs">
): Pick<RequestRateLimitConfig, "maxRequests" | "windowMs"> {
  return {
    maxRequests: parsePositiveInteger(
      env[`${prefix}_RATE_LIMIT_MAX_REQUESTS`],
      defaults.maxRequests,
      MIN_RATE_LIMIT_MAX_REQUESTS
    ),
    windowMs: parsePositiveInteger(
      env[`${prefix}_RATE_LIMIT_WINDOW_MS`],
      defaults.windowMs,
      MIN_RATE_LIMIT_WINDOW_MS
    )
  };
}

export function rateLimitRequest(
  request: Pick<Request, "headers">,
  config: RequestRateLimitConfig
): RequestRateLimitResult {
  const now = Date.now();
  pruneExpiredEntries(now);

  const maxRequests = Math.max(MIN_RATE_LIMIT_MAX_REQUESTS, Math.floor(config.maxRequests));
  const windowMs = Math.max(MIN_RATE_LIMIT_WINDOW_MS, Math.floor(config.windowMs));
  const key = `${config.bucket}:${getRequestClientIp(request)}`;
  const entry = requestRateLimitMap.get(key);

  if (!entry || now >= entry.resetAt) {
    requestRateLimitMap.set(key, {
      count: 1,
      resetAt: now + windowMs
    });
    return null;
  }

  entry.count += 1;
  if (entry.count <= maxRequests) {
    return null;
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  return {
    error: config.errorMessage,
    headers: {
      "Retry-After": String(retryAfterSeconds)
    },
    retryAfterSeconds,
    status: 429
  };
}

export function resetRequestRateLimits(): void {
  requestRateLimitMap.clear();
  requestsSinceLastPrune = 0;
}
