import { describe, expect, it } from "vitest";
import { buildAdminAccessStatusItems, buildAdminActionFeedbackStatusItems } from "./adminStatus";

describe("adminStatus", () => {
  it("builds missing-candidate and rejected-auth hints consistently", () => {
    expect(
      buildAdminAccessStatusItems({
        keyPrefix: "marketplace",
        hasAdminAuthCandidate: false,
        hasVerifiedAdminAccess: false,
        adminBackendAuthMessage: "Unauthorized"
      })
    ).toEqual([
      {
        tone: "hint",
        message: "Provide an admin token or allowlisted admin address to verify backend access.",
        key: "marketplace-auth-candidate"
      },
      {
        tone: "hint",
        message: "",
        key: "marketplace-auth-status"
      },
      {
        tone: "hint",
        message: "",
        key: "marketplace-verified-hint"
      }
    ]);

    expect(
      buildAdminAccessStatusItems({
        keyPrefix: "marketplace",
        hasAdminAuthCandidate: true,
        hasVerifiedAdminAccess: false,
        adminBackendAuthMessage: "Unauthorized"
      })[1]
    ).toEqual({
      tone: "hint",
      message: "Unauthorized",
      key: "marketplace-auth-status"
    });
  });

  it("only emits verified-only hints after backend auth succeeds", () => {
    expect(
      buildAdminAccessStatusItems({
        keyPrefix: "mint",
        hasAdminAuthCandidate: true,
        hasVerifiedAdminAccess: true,
        adminBackendAuthMessage: "",
        verifiedOnlyHintMessage: "Run the Prisma migration first."
      })[2]
    ).toEqual({
      tone: "hint",
      message: "Run the Prisma migration first.",
      key: "mint-verified-hint"
    });
  });

  it("builds shared action feedback items", () => {
    expect(
      buildAdminActionFeedbackStatusItems({
        keyPrefix: "payment-token",
        actionStatus: "Token is now allowlisted on-chain.",
        actionError: "Connected wallet is not the registry owner."
      })
    ).toEqual([
      {
        tone: "success",
        message: "Token is now allowlisted on-chain.",
        key: "payment-token-action-status"
      },
      {
        tone: "error",
        message: "Connected wallet is not the registry owner.",
        key: "payment-token-action-error"
      }
    ]);
  });
});
