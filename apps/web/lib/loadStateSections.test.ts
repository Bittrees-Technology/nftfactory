import { describe, expect, it } from "vitest";
import { errorActionState, successActionState } from "./actionState";
import { errorLoadState, loadingLoadState, readyLoadState } from "./loadState";
import { buildSectionLoadStatusItems } from "./loadStateSections";

describe("loadStateSections", () => {
  it("builds load, hint, and error items with stable keys", () => {
    expect(
      buildSectionLoadStatusItems({
        keyPrefix: "listing",
        loadState: loadingLoadState(),
        loadingMessage: "Loading indexed creator listings...",
        hintMessage: "Moderation filters are unavailable."
      })
    ).toEqual([
      {
        tone: "hint",
        message: "Loading indexed creator listings...",
        key: "listing-load"
      },
      {
        tone: "hint",
        message: "Moderation filters are unavailable.",
        key: "listing-hint"
      },
      {
        tone: "error",
        message: undefined,
        key: "listing-error"
      }
    ]);
  });

  it("can prepend action state before load state when needed", () => {
    expect(
      buildSectionLoadStatusItems({
        keyPrefix: "browse",
        actionState: successActionState("Bought listing #4."),
        actionFirst: true,
        loadState: readyLoadState(),
        hintMessage: "Indexer moderation filtering is disabled."
      })
    ).toEqual([
      {
        tone: "success",
        message: "Bought listing #4.",
        key: "browse-action"
      },
      {
        tone: "hint",
        message: "",
        key: "browse-load"
      },
      {
        tone: "hint",
        message: "Indexer moderation filtering is disabled.",
        key: "browse-hint"
      },
      {
        tone: "error",
        message: undefined,
        key: "browse-error"
      }
    ]);
  });

  it("can append explicit action and error messages after load state", () => {
    expect(
      buildSectionLoadStatusItems({
        keyPrefix: "admin-refresh",
        loadState: errorLoadState("Admin refresh is partial."),
        errorMessage: "Failed to apply decision.",
        actionState: errorActionState("Resolve report failed.")
      })
    ).toEqual([
      {
        tone: "error",
        message: "Admin refresh is partial.",
        key: "admin-refresh-load"
      },
      {
        tone: "hint",
        message: undefined,
        key: "admin-refresh-hint"
      },
      {
        tone: "error",
        message: "Failed to apply decision.",
        key: "admin-refresh-error"
      },
      {
        tone: "error",
        message: "Resolve report failed.",
        key: "admin-refresh-action"
      }
    ]);
  });
});
