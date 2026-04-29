import { describe, expect, it } from "vitest";
import { getIndexerAdminProtectionMessage, getIndexerSourceSummary, parseHealthDetails } from "./deployHealth";

describe("deployHealth helpers", () => {
  it("parses object payloads from health text", () => {
    expect(parseHealthDetails('{"ok":true,"service":"indexer-api"}')).toEqual({
      ok: true,
      service: "indexer-api"
    });
    expect(parseHealthDetails("not-json")).toBeUndefined();
  });

  it("summarizes indexer source wiring", () => {
    expect(
      getIndexerSourceSummary({
        indexingSources: {
          sharedContracts: { count: 2 },
          explicitCustomCollections: { count: 1, configured: true }
        }
      })
    ).toBe("shared=2, custom=1");

    expect(getIndexerSourceSummary(undefined)).toBe("registry-only");
  });

  it("flags unprotected admin mutation routes", () => {
    expect(
      getIndexerAdminProtectionMessage({
        adminProtection: {
          protected: false,
          mode: "unprotected"
        }
      })
    ).toBe("Indexer admin mutation routes are unprotected.");

    expect(
      getIndexerAdminProtectionMessage({
        adminProtection: {
          protected: false,
          mode: "unprotected-override"
        }
      })
    ).toBe("Indexer admin mutation routes are unprotected via INDEXER_ALLOW_UNPROTECTED_ADMIN.");

    expect(
      getIndexerAdminProtectionMessage({
        adminProtection: {
          protected: true,
          mode: "token"
        }
      })
    ).toBeNull();
  });
});
