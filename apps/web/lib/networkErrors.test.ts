import { describe, expect, it } from "vitest";
import { normalizeBackendFetchError, parseJsonResponse } from "./networkErrors";

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
});
