import { describe, expect, it } from "vitest";
import {
  normalizeBackendFetchError,
  parseJsonResponse,
  sanitizeBackendErrorMessage
} from "./networkErrors";

describe("networkErrors", () => {
  it("maps private backend URLs to a deployment reachability error", () => {
    const error = normalizeBackendFetchError(new TypeError("fetch failed"), {
      serviceLabel: "IPFS upload backend",
      envVarName: "IPFS_API_URL",
      baseUrl: "http://192.168.1.115:5001"
    });

    expect(error.message).toContain("IPFS upload backend");
    expect(error.message).toContain("IPFS_API_URL");
    expect(error.message).toContain("public HTTP(S) endpoint");
  });

  it("maps generic fetch failures to a clearer public endpoint error", () => {
    const error = normalizeBackendFetchError(new TypeError("fetch failed"), {
      serviceLabel: "Indexer API",
      envVarName: "NEXT_PUBLIC_INDEXER_API_URL",
      baseUrl: "https://indexer.example.com"
    });

    expect(error.message).toContain("Indexer API request failed.");
    expect(error.message).toContain("NEXT_PUBLIC_INDEXER_API_URL");
  });

  it("preserves non-fetch errors", () => {
    const error = normalizeBackendFetchError(new Error("Permission denied"), {
      serviceLabel: "Indexer API",
      envVarName: "NEXT_PUBLIC_INDEXER_API_URL"
    });

    expect(error.message).toBe("Permission denied");
  });

  it("parses JSON text", () => {
    expect(parseJsonResponse<{ ok: boolean }>('{\"ok\":true}', "Bad response")).toEqual({ ok: true });
  });

  it("throws a fallback error when the response is not JSON", () => {
    expect(() => parseJsonResponse("<html>oops</html>", "Bad response")).toThrow("Bad response");
  });

  it("collapses Cloudflare tunnel HTML into a safe backend message", () => {
    const message = sanitizeBackendErrorMessage(
      "<!doctype html><html><head><title>Cloudflare Tunnel error</title></head><body>Error 1033</body></html>",
      "Indexer API request failed (503)",
      { serviceLabel: "Indexer API" }
    );

    expect(message).toBe("Indexer API is temporarily unavailable because the upstream tunnel is down.");
  });

  it("falls back for generic HTML error pages", () => {
    const message = sanitizeBackendErrorMessage(
      "<html><body>Bad gateway</body></html>",
      "Indexer API request failed (502)",
      { serviceLabel: "Indexer API" }
    );

    expect(message).toBe("Indexer API request failed (502)");
  });

  it("collapses Cloudflare tunnel HTML into a safe IPFS backend message", () => {
    const message = sanitizeBackendErrorMessage(
      "<!doctype html><html><head><title>Cloudflare Tunnel error | ipfs-api.nftfactory.org</title></head><body>Error 1033</body></html>",
      "IPFS upload failed (HTTP 530).",
      { serviceLabel: "IPFS upload backend" }
    );

    expect(message).toBe("IPFS upload backend is temporarily unavailable because the upstream tunnel is down.");
  });

  it("collapses plain Cloudflare 1033 text into a safe backend message", () => {
    const message = sanitizeBackendErrorMessage(
      "error code: 1033",
      "IPFS upload failed (HTTP 530).",
      { serviceLabel: "IPFS upload backend" }
    );

    expect(message).toBe("IPFS upload backend is temporarily unavailable because the upstream tunnel is down.");
  });
});
