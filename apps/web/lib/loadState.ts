import { errorStatus, hintStatus, type StatusItem } from "./statusItems";

export type LoadState = {
  status: "idle" | "loading" | "ready" | "partial" | "error";
  message?: string;
};

export function idleLoadState(message?: string): LoadState {
  return { status: "idle", message };
}

export function loadingLoadState(message?: string): LoadState {
  return { status: "loading", message };
}

export function readyLoadState(message?: string): LoadState {
  return { status: "ready", message };
}

export function partialLoadState(message: string): LoadState {
  return { status: "partial", message };
}

export function errorLoadState(message: string): LoadState {
  return { status: "error", message };
}

export function isLoadStateLoading(state: LoadState): boolean {
  return state.status === "loading";
}

export function loadStateStatusItem(
  state: LoadState,
  key?: string,
  options?: {
    loadingMessage?: string;
    readyMessage?: string;
  }
): StatusItem {
  if (state.status === "loading") {
    return hintStatus(options?.loadingMessage || state.message || "", key);
  }
  if (state.status === "error") {
    return errorStatus(state.message || "", key);
  }
  if (state.status === "partial") {
    return hintStatus(state.message || "", key);
  }
  if (state.status === "ready" && (options?.readyMessage || state.message)) {
    return hintStatus(options?.readyMessage || state.message || "", key);
  }
  return hintStatus("", key);
}
