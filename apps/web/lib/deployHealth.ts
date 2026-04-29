type RecordLike = Record<string, unknown>;

export function parseHealthDetails(text: string): RecordLike | undefined {
  try {
    const parsed = JSON.parse(text) as RecordLike;
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function getIndexerSourceSummary(details: RecordLike | undefined): string {
  const indexingSources = (details?.indexingSources as RecordLike | undefined) || undefined;
  const sharedContracts = (indexingSources?.sharedContracts as RecordLike | undefined) || undefined;
  const explicitCustomCollections = (indexingSources?.explicitCustomCollections as RecordLike | undefined) || undefined;
  const sharedCount = Number(sharedContracts?.count || 0);
  const customCount = Number(explicitCustomCollections?.count || 0);
  const customConfigured = Boolean(explicitCustomCollections?.configured);

  return sharedCount > 0 || customConfigured
    ? `shared=${sharedCount}, custom=${customCount}${customConfigured ? "" : " (custom file unset)"}`
    : "registry-only";
}

export function getIndexerAdminProtectionMessage(details: RecordLike | undefined): string | null {
  const adminProtection = (details?.adminProtection as RecordLike | undefined) || undefined;
  if (!adminProtection || adminProtection.protected !== false) {
    return null;
  }

  const mode = String(adminProtection.mode || "").trim().toLowerCase();
  if (mode === "unprotected-override") {
    return "Indexer admin mutation routes are unprotected via INDEXER_ALLOW_UNPROTECTED_ADMIN.";
  }

  return "Indexer admin mutation routes are unprotected.";
}
