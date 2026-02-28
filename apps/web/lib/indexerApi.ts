function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_INDEXER_API_URL || "http://127.0.0.1:8787";
}

const INDEXER_REQUEST_TIMEOUT_MS = 12_000;

function withTimeout(init?: RequestInit): { init: RequestInit; cleanup: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), INDEXER_REQUEST_TIMEOUT_MS);
  return {
    init: {
      ...init,
      signal: controller.signal
    },
    cleanup: () => clearTimeout(timeout)
  };
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const { init: requestInit, cleanup } = withTimeout(init);
  try {
    const response = await fetch(`${getBaseUrl()}${path}`, {
      ...requestInit,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {})
      },
      cache: "no-store"
    });

    if (!response.ok) {
      const text = await response.text();
      let message = text;
      if (text) {
        try {
          const parsed = JSON.parse(text) as { error?: string };
          if (parsed.error?.trim()) {
            message = parsed.error;
          }
        } catch {
          // Keep raw response text when payload is not JSON.
        }
      }
      throw new Error(message || `Request failed (${response.status})`);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Indexer request timed out after ${INDEXER_REQUEST_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    cleanup();
  }
}

export type AdminAuth = {
  adminToken?: string;
  adminAddress?: string;
};

function adminHeaders(auth?: AdminAuth): Record<string, string> {
  const headers: Record<string, string> = {};
  if (auth?.adminToken?.trim()) {
    headers.Authorization = `Bearer ${auth.adminToken.trim()}`;
  }
  if (auth?.adminAddress?.trim()) {
    headers["x-admin-address"] = auth.adminAddress.trim();
  }
  return headers;
}

export type ApiModerationReport = {
  id: string;
  listingId: number | null;
  reason: string;
  reporterAddress: string;
  status: string;
  evidence?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApiModerationAction = {
  id: string;
  action: string;
  actor: string;
  notes?: string | null;
  reportId?: string | null;
  listingId: number | null;
  createdAt: string;
};

export type ApiProfileResolution = {
  name: string;
  sellers: string[];
  collections: Array<{
    ensSubname: string | null;
    contractAddress: string;
    ownerAddress: string;
  }>;
};

export async function fetchHiddenListingIds(): Promise<number[]> {
  const payload = await fetchJson<{ listingIds: number[] }>("/api/moderation/hidden-listings");
  return payload.listingIds || [];
}

export async function createModerationReport(payload: {
  listingId: number;
  collectionAddress: string;
  tokenId: string;
  sellerAddress: string;
  standard: string;
  reporterAddress: string;
  reason: string;
}): Promise<void> {
  await fetchJson("/api/moderation/reports", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function fetchModerationReports(status?: "open" | "resolved"): Promise<ApiModerationReport[]> {
  const query = status ? `?status=${status}` : "";
  return fetchJson<ApiModerationReport[]>(`/api/moderation/reports${query}`);
}

export async function resolveModerationReport(payload: {
  reportId: string;
  action: "hide" | "restore" | "dismiss";
  actor: string;
  notes?: string;
  auth?: AdminAuth;
}): Promise<void> {
  await fetchJson(`/api/moderation/reports/${payload.reportId}/resolve`, {
    method: "POST",
    headers: adminHeaders(payload.auth),
    body: JSON.stringify({
      action: payload.action,
      actor: payload.actor,
      notes: payload.notes
    })
  });
}

export async function setListingVisibility(payload: {
  listingId: number;
  hidden: boolean;
  actor: string;
  notes?: string;
  auth?: AdminAuth;
}): Promise<void> {
  await fetchJson(`/api/moderation/listings/${payload.listingId}/visibility`, {
    method: "POST",
    headers: adminHeaders(payload.auth),
    body: JSON.stringify({
      hidden: payload.hidden,
      actor: payload.actor,
      notes: payload.notes
    })
  });
}

export async function fetchModerationActions(): Promise<ApiModerationAction[]> {
  return fetchJson<ApiModerationAction[]>("/api/moderation/actions");
}

export async function fetchProfileResolution(name: string): Promise<ApiProfileResolution> {
  return fetchJson<ApiProfileResolution>(`/api/profile/${encodeURIComponent(name)}`);
}

export async function backfillCollectionSubname(payload: {
  subname: string;
  ownerAddress?: string;
  contractAddress?: string;
  auth?: AdminAuth;
}): Promise<{ ok: boolean; updatedCount: number; subname: string }> {
  return fetchJson<{ ok: boolean; updatedCount: number; subname: string }>("/api/admin/collections/backfill-subname", {
    method: "POST",
    headers: adminHeaders(payload.auth),
    body: JSON.stringify({
      subname: payload.subname,
      ownerAddress: payload.ownerAddress,
      contractAddress: payload.contractAddress
    })
  });
}
