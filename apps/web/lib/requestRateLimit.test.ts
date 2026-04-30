import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getRequestClientIp,
  rateLimitRequest,
  resetRequestRateLimits,
  resolveRequestRateLimitConfig
} from "./requestRateLimit";

describe("requestRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    resetRequestRateLimits();
  });

  it("prefers CDN and proxy client IP headers", () => {
    const cfRequest = new Request("https://nftfactory.org", {
      headers: {
        "cf-connecting-ip": "203.0.113.10",
        "x-forwarded-for": "198.51.100.12"
      }
    });
    expect(getRequestClientIp(cfRequest)).toBe("203.0.113.10");

    const forwardedRequest = new Request("https://nftfactory.org", {
      headers: {
        "x-forwarded-for": "198.51.100.12, 192.0.2.9"
      }
    });
    expect(getRequestClientIp(forwardedRequest)).toBe("198.51.100.12");
  });

  it("returns unknown when no client IP headers are present", () => {
    expect(getRequestClientIp(new Request("https://nftfactory.org"))).toBe("unknown");
  });

  it("allows requests until the bucket limit is exceeded", () => {
    const request = new Request("https://nftfactory.org", {
      headers: {
        "x-forwarded-for": "198.51.100.12"
      }
    });
    const config = {
      bucket: "ipfs-metadata",
      errorMessage: "Too many requests.",
      maxRequests: 2,
      windowMs: 60_000
    } as const;

    expect(rateLimitRequest(request, config)).toBeNull();
    expect(rateLimitRequest(request, config)).toBeNull();
    expect(rateLimitRequest(request, config)).toEqual({
      error: "Too many requests.",
      headers: {
        "Retry-After": "60"
      },
      retryAfterSeconds: 60,
      status: 429
    });
  });

  it("resets a bucket after the window expires", () => {
    const request = new Request("https://nftfactory.org", {
      headers: {
        "x-real-ip": "203.0.113.20"
      }
    });
    const config = {
      bucket: "profile-publish",
      errorMessage: "Too many requests.",
      maxRequests: 1,
      windowMs: 60_000
    } as const;

    expect(rateLimitRequest(request, config)).toBeNull();
    expect(rateLimitRequest(request, config)?.status).toBe(429);

    vi.advanceTimersByTime(60_000);

    expect(rateLimitRequest(request, config)).toBeNull();
  });

  it("tracks each bucket independently", () => {
    const request = new Request("https://nftfactory.org", {
      headers: {
        "true-client-ip": "203.0.113.30"
      }
    });

    expect(
      rateLimitRequest(request, {
        bucket: "ipfs-metadata",
        errorMessage: "Too many metadata requests.",
        maxRequests: 1,
        windowMs: 60_000
      })
    ).toBeNull();
    expect(
      rateLimitRequest(request, {
        bucket: "profile-publish",
        errorMessage: "Too many profile requests.",
        maxRequests: 1,
        windowMs: 60_000
      })
    ).toBeNull();
  });

  it("falls back to defaults for invalid env overrides", () => {
    expect(
      resolveRequestRateLimitConfig(
        {
          IPFS_METADATA_RATE_LIMIT_MAX_REQUESTS: "0",
          IPFS_METADATA_RATE_LIMIT_WINDOW_MS: "abc"
        },
        "IPFS_METADATA",
        {
          maxRequests: 10,
          windowMs: 300_000
        }
      )
    ).toEqual({
      maxRequests: 10,
      windowMs: 300_000
    });
  });
});
