import type {
  ApiActiveListingItem,
  ApiMintFeedItem,
  ApiOwnerHoldingsResponse
} from "./indexerApi";
import type { ChainFailure } from "./profileMultiChain";

export type ListingManagementInventoryItem = ApiMintFeedItem | ApiOwnerHoldingsResponse["items"][number];

export type ApiListingManagementViewResponse = {
  ownerAddress: string;
  chainIds: number[];
  inventoryItems: ListingManagementInventoryItem[];
  inventoryFailures: ChainFailure[];
  inventoryError: string | null;
  listingItems: ApiActiveListingItem[];
  listingFailures: ChainFailure[];
  listingError: string | null;
};

const LISTING_MANAGEMENT_TIMEOUT_MS = 15_000;

function withTimeout(timeoutMs = LISTING_MANAGEMENT_TIMEOUT_MS): { signal: AbortSignal; cleanup: () => void } {
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
      return `Listing management request timed out after ${LISTING_MANAGEMENT_TIMEOUT_MS}ms`;
    }
    return error.message || fallback;
  }
  return fallback;
}

export async function fetchListingManagementView(params: {
  ownerAddress: string;
  standard: "ERC721" | "ERC1155";
  chainFilter?: "all" | number;
}): Promise<ApiListingManagementViewResponse> {
  const query = new URLSearchParams({
    owner: params.ownerAddress,
    standard: params.standard
  });
  if (typeof params.chainFilter === "number" && Number.isInteger(params.chainFilter) && params.chainFilter > 0) {
    query.set("chainId", String(params.chainFilter));
  }

  const { signal, cleanup } = withTimeout();
  try {
    const response = await fetch(`/api/profile/listing-management?${query.toString()}`, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json"
      },
      signal
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Listing management request failed (${response.status})`);
    }
    return (await response.json()) as ApiListingManagementViewResponse;
  } catch (error) {
    throw new Error(parseErrorMessage(error, "Failed to load listing management data."));
  } finally {
    cleanup();
  }
}
