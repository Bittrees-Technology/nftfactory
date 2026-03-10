export type AdminBackendAuthState = {
  status: "missing" | "checking" | "verified" | "rejected" | "error";
  message: string;
};

export function classifyAdminAuthError(error: unknown): AdminBackendAuthState {
  const message = error instanceof Error ? error.message : "Failed to verify admin access.";
  const normalized = message.toLowerCase();
  if (
    normalized.includes("missing or invalid admin token") ||
    normalized.includes("actor is not in admin allowlist") ||
    normalized.includes("unauthorized")
  ) {
    return {
      status: "rejected",
      message
    };
  }
  return {
    status: "error",
    message
  };
}

export function formatAdminAuthCandidate(adminTokenValue: string, typedAdminAddress: string, connectedAddress?: string): string {
  const hasToken = Boolean(adminTokenValue);
  const hasTypedAddress = Boolean(typedAdminAddress);
  const hasConnectedAddress = Boolean(connectedAddress);

  if (hasToken && hasTypedAddress) return "Token + manual address";
  if (hasToken && hasConnectedAddress) return "Token + wallet";
  if (hasToken) return "Token only";
  if (hasTypedAddress) return "Manual address";
  if (hasConnectedAddress) return "Connected wallet";
  return "Missing";
}

export function resolveAdminBackendAuthState(
  moderatorStateResult: PromiseSettledResult<unknown>,
  paymentTokenRowsResult: PromiseSettledResult<unknown>
): AdminBackendAuthState {
  const authErrors = [moderatorStateResult, paymentTokenRowsResult]
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result) => classifyAdminAuthError(result.reason));
  const anyVerified = moderatorStateResult.status === "fulfilled" || paymentTokenRowsResult.status === "fulfilled";

  if (anyVerified) {
    return {
      status: "verified",
      message: "Indexer accepted the current admin credentials."
    };
  }
  if (authErrors.some((item) => item.status === "rejected")) {
    return authErrors.find((item) => item.status === "rejected") || authErrors[0] || {
      status: "rejected",
      message: "Indexer rejected the current admin credentials."
    };
  }
  return (
    authErrors[0] || {
      status: "error",
      message: "Failed to verify admin access against the indexer."
    }
  );
}

export function summarizeAdminRefreshFailures(
  scope: string,
  failures: Array<{ label: string; reason: unknown }>
): string {
  if (!failures.length) return "";
  const parts = failures.map(({ label, reason }) => {
    const detail = reason instanceof Error ? reason.message : "request failed";
    return `${label}: ${detail}`;
  });
  return `${scope} refresh is partial. ${parts.join(" | ")}`;
}
