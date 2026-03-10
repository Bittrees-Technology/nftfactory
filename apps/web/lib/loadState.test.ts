import { describe, expect, it } from "vitest";
import {
  errorLoadState,
  isLoadStateLoading,
  loadStateStatusItem,
  loadingLoadState,
  partialLoadState,
  readyLoadState
} from "./loadState";

describe("loadState", () => {
  it("tracks loading and ready states consistently", () => {
    expect(isLoadStateLoading(loadingLoadState("Loading..."))).toBe(true);
    expect(isLoadStateLoading(readyLoadState())).toBe(false);
  });

  it("maps error and partial states into status items", () => {
    expect(loadStateStatusItem(errorLoadState("Failed to load."), "load")).toEqual({
      tone: "error",
      message: "Failed to load.",
      key: "load"
    });
    expect(loadStateStatusItem(partialLoadState("Refresh is partial."), "load")).toEqual({
      tone: "hint",
      message: "Refresh is partial.",
      key: "load"
    });
  });

  it("uses provided loading messages when rendering status items", () => {
    expect(
      loadStateStatusItem(loadingLoadState(), "load", {
        loadingMessage: "Loading listings..."
      })
    ).toEqual({
      tone: "hint",
      message: "Loading listings...",
      key: "load"
    });
  });
});
