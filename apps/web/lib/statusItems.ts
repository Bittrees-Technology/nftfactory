export type StatusTone = "hint" | "error" | "success";

export type StatusItem = {
  tone: StatusTone;
  message: string | null | undefined;
  key?: string;
};

export function statusItem(tone: StatusTone, message: string | null | undefined, key?: string): StatusItem {
  return { tone, message, key };
}

export function hintStatus(message: string | null | undefined, key?: string): StatusItem {
  return statusItem("hint", message, key);
}

export function errorStatus(message: string | null | undefined, key?: string): StatusItem {
  return statusItem("error", message, key);
}

export function successStatus(message: string | null | undefined, key?: string): StatusItem {
  return statusItem("success", message, key);
}

export function inferStatusTone(message: string | null | undefined): StatusTone {
  const normalized = String(message || "").trim().toLowerCase();
  if (!normalized) return "hint";
  if (
    normalized.includes("failed") ||
    normalized.includes("error") ||
    normalized.includes("not configured") ||
    normalized.includes("not the") ||
    normalized.includes("verify admin access") ||
    normalized.includes("switch to") ||
    normalized.includes("connect ")
  ) {
    return "error";
  }
  if (
    normalized.includes("complete") ||
    normalized.includes("completed") ||
    normalized.includes("now ") ||
    normalized.includes("already ")
  ) {
    return "success";
  }
  return "hint";
}

export function inferredStatus(message: string | null | undefined, key?: string): StatusItem {
  return statusItem(inferStatusTone(message), message, key);
}

export function asyncActionStatus(
  status: "idle" | "success" | "error" | string,
  message: string | null | undefined,
  key?: string
): StatusItem {
  if (status === "success") return successStatus(message, key);
  if (status === "error") return errorStatus(message, key);
  return hintStatus(status === "idle" ? "" : message, key);
}
