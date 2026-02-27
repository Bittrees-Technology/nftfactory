import type { IncomingMessage } from "node:http";

export function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export function isZeroAddress(value: string): boolean {
  return /^0x0{40}$/.test(value);
}

export function normalizeSubname(input: string): string {
  return input.trim().toLowerCase().replace(/\.nftfactory\.eth$/, "");
}

export function parseBearerToken(header: string | undefined): string {
  if (!header) return "";
  const [scheme, token] = header.trim().split(/\s+/, 2);
  if (!scheme || !token) return "";
  if (scheme.toLowerCase() !== "bearer") return "";
  return token.trim();
}

export function getClientIp(req: IncomingMessage, trustProxy = false): string {
  if (trustProxy) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string") {
      const first = forwarded
        .split(",")
        .map((item) => item.trim())
        .find(Boolean);
      if (first) return first;
    }
  }
  return req.socket.remoteAddress || "unknown";
}

// Simple per-IP rate limiter for admin write endpoints.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX_REQUESTS;
}

export function resetRateLimits(): void {
  rateLimitMap.clear();
}
