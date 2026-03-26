import type {
  ApiActiveListingItem,
  ApiOfferSummary,
  ApiOwnerHoldingsResponse,
  ApiProfileResolution
} from "./indexerApi";
import type { ChainFailure } from "./profileMultiChain";
import {
  fetchProfileViewSnapshot,
  hasProfileSnapshotFallbackConfigured
} from "./profileSnapshotApi";

export type ApiProfileViewResponse = {
  name: string;
  resolution: ApiProfileResolution | null;
  resolutionFailures: ChainFailure[];
  resolutionError: string | null;
  activeSellerAddresses: string[];
  listings: ApiActiveListingItem[];
  listingFailures: ChainFailure[];
  listingError: string | null;
  hiddenListingRecordIds: string[];
  hiddenListingFailures: ChainFailure[];
  hiddenListingError: string | null;
  offers: ApiOfferSummary[];
  offerFailures: ChainFailure[];
  offerError: string | null;
  holdings: ApiOwnerHoldingsResponse["items"];
  holdingsFailures: ChainFailure[];
  holdingsError: string | null;
};

const PROFILE_VIEW_TIMEOUT_MS = 15_000;

function withTimeout(timeoutMs = PROFILE_VIEW_TIMEOUT_MS): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeout)
  };
}

function parseErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return `Profile view request timed out after ${PROFILE_VIEW_TIMEOUT_MS}ms`;
    }
    return error.message || fallback;
  }
  return fallback;
}

export async function fetchProfileView(
  name: string,
  options?: {
    seller?: string | null;
    limit?: number;
  }
): Promise<ApiProfileViewResponse> {
  const params = new URLSearchParams();
  if (options?.seller?.trim()) {
    params.set("seller", options.seller.trim());
  }
  if (Number.isInteger(options?.limit) && Number(options?.limit) > 0) {
    params.set("limit", String(options?.limit));
  }

  const query = params.toString();
  const path = `/api/profile/view/${encodeURIComponent(name)}${query ? `?${query}` : ""}`;
  const { signal, cleanup } = withTimeout();
  try {
    const response = await fetch(path, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json"
      },
      signal
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Profile view request failed (${response.status})`);
    }
    return (await response.json()) as ApiProfileViewResponse;
  } catch (error) {
    const primaryErrorMessage = parseErrorMessage(error, "Failed to load profile view.");
    if (!hasProfileSnapshotFallbackConfigured()) {
      throw new Error(primaryErrorMessage);
    }

    try {
      const snapshot = await fetchProfileViewSnapshot(name);
      if (snapshot) {
        return snapshot;
      }
    } catch (snapshotError) {
      const snapshotMessage = parseErrorMessage(snapshotError, "Failed to load profile snapshot.");
      throw new Error(`${primaryErrorMessage} Snapshot fallback failed: ${snapshotMessage}`);
    }

    throw new Error(primaryErrorMessage);
  } finally {
    cleanup();
  }
}
