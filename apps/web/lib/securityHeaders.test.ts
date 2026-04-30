import { describe, expect, it } from "vitest";
import {
  applySecurityHeaders,
  BASIC_AUTH_CACHE_CONTROL_HEADER,
  BASIC_AUTH_ROBOTS_HEADER,
  STRICT_TRANSPORT_SECURITY_HEADER
} from "./securityHeaders";

describe("securityHeaders", () => {
  it("applies the baseline browser security headers", () => {
    const headers = new Headers();

    applySecurityHeaders(headers);

    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=(), browsing-topics=()"
    );
    expect(headers.get("Strict-Transport-Security")).toBeNull();
  });

  it("adds strict transport security in production mode", () => {
    const headers = new Headers();

    applySecurityHeaders(headers, { production: true });

    expect(headers.get("Strict-Transport-Security")).toBe(STRICT_TRANSPORT_SECURITY_HEADER);
  });

  it("adds no-store, noindex, and vary behavior for basic-auth deployments", () => {
    const headers = new Headers({ Vary: "Accept-Encoding" });

    applySecurityHeaders(headers, { basicAuthEnabled: true });

    expect(headers.get("Cache-Control")).toBe(BASIC_AUTH_CACHE_CONTROL_HEADER);
    expect(headers.get("Pragma")).toBe("no-cache");
    expect(headers.get("X-Robots-Tag")).toBe(BASIC_AUTH_ROBOTS_HEADER);
    expect(headers.get("Vary")).toBe("Accept-Encoding, Authorization");
  });

  it("keeps vary authorization idempotent", () => {
    const headers = new Headers({ Vary: "Authorization" });

    applySecurityHeaders(headers, { basicAuthEnabled: true });
    applySecurityHeaders(headers, { basicAuthEnabled: true });

    expect(headers.get("Vary")).toBe("Authorization");
  });
});
