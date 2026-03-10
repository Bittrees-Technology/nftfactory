import { describe, expect, it } from "vitest";
import {
  classifyAdminAuthError,
  formatAdminAuthCandidate,
  resolveAdminBackendAuthState,
  summarizeAdminRefreshFailures
} from "./adminState";

describe("adminState", () => {
  it("classifies unauthorized admin errors as rejected", () => {
    expect(classifyAdminAuthError(new Error("Actor is not in admin allowlist."))).toEqual({
      status: "rejected",
      message: "Actor is not in admin allowlist."
    });
  });

  it("formats auth candidates consistently", () => {
    expect(formatAdminAuthCandidate("token", "", undefined)).toBe("Token only");
    expect(formatAdminAuthCandidate("", "0xabc", undefined)).toBe("Manual address");
    expect(formatAdminAuthCandidate("", "", "0xabc")).toBe("Connected wallet");
    expect(formatAdminAuthCandidate("token", "", "0xabc")).toBe("Token + wallet");
  });

  it("treats any successful privileged read as verified backend access", () => {
    expect(
      resolveAdminBackendAuthState(
        { status: "fulfilled", value: {} },
        { status: "rejected", reason: new Error("request failed") }
      )
    ).toEqual({
      status: "verified",
      message: "Indexer accepted the current admin credentials."
    });
  });

  it("surfaces rejected auth when all privileged reads fail with auth errors", () => {
    expect(
      resolveAdminBackendAuthState(
        { status: "rejected", reason: new Error("Unauthorized") },
        { status: "rejected", reason: new Error("Missing or invalid admin token") }
      )
    ).toEqual({
      status: "rejected",
      message: "Unauthorized"
    });
  });

  it("summarizes partial refresh failures with section labels", () => {
    expect(
      summarizeAdminRefreshFailures("Admin", [
        { label: "health", reason: new Error("timeout") },
        { label: "reports", reason: "unavailable" }
      ])
    ).toBe("Admin refresh is partial. health: timeout | reports: request failed");
  });
});
