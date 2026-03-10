import { describe, expect, it } from "vitest";
import { asyncActionStatus, hintStatus, inferStatusTone, inferredStatus } from "./statusItems";

describe("statusItems", () => {
  it("builds hint items consistently", () => {
    expect(hintStatus("Waiting for sync", "sync")).toEqual({
      tone: "hint",
      message: "Waiting for sync",
      key: "sync"
    });
  });

  it("infers error and success tones from shared status messages", () => {
    expect(inferStatusTone("Failed to sync marketplace listings.")).toBe("error");
    expect(inferredStatus("Token is now allowlisted on-chain.", "token")).toEqual({
      tone: "success",
      message: "Token is now allowlisted on-chain.",
      key: "token"
    });
  });

  it("maps async action states into shared status items", () => {
    expect(asyncActionStatus("idle", "Completed", "action")).toEqual({
      tone: "hint",
      message: "",
      key: "action"
    });
    expect(asyncActionStatus("success", "Offer accepted", "action").tone).toBe("success");
    expect(asyncActionStatus("error", "Offer failed", "action").tone).toBe("error");
  });
});
