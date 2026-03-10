import { describe, expect, it } from "vitest";
import {
  actionStateStatusItem,
  errorActionState,
  idleActionState,
  pendingActionState,
  successActionState
} from "./actionState";

describe("actionState", () => {
  it("builds consistent action states", () => {
    expect(idleActionState()).toMatchObject({ status: "idle" });
    expect(pendingActionState("Saving...", "0xabc")).toEqual({
      status: "pending",
      message: "Saving...",
      hash: "0xabc"
    });
    expect(successActionState("Saved.")).toEqual({
      status: "success",
      message: "Saved.",
      hash: undefined
    });
    expect(errorActionState("Failed.")).toEqual({
      status: "error",
      message: "Failed.",
      hash: undefined
    });
  });

  it("maps action states into status items", () => {
    expect(actionStateStatusItem(successActionState("Saved."), "save")).toEqual({
      tone: "success",
      message: "Saved.",
      key: "save"
    });
    expect(actionStateStatusItem(idleActionState(), "save")).toEqual({
      tone: "hint",
      message: "",
      key: "save"
    });
  });
});
