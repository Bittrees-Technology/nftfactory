import { getAppChain, getEnabledAppChainIds } from "./chains";
import {
  fetchActiveListings,
  fetchHiddenListings,
  fetchOffersMade,
  fetchOffersReceived,
  fetchOwnerHoldings,
  fetchProfileResolution,
  type ApiActiveListingItem,
  type ApiHiddenListings,
  type ApiOfferSummary,
  type ApiOwnerHoldingsResponse,
  type ApiProfileRecord,
  type ApiProfileResolution
} from "./indexerApi";

export type ChainFailure = {
  chainId: number;
  message: string;
};

function toFailure(chainId: number, error: unknown): ChainFailure {
  return {
    chainId,
    message: error instanceof Error ? error.message : `Failed to load ${getAppChain(chainId).name}`
  };
}

function throwIfEveryChainFailed<T>(results: T[], failures: ChainFailure[], fallbackMessage: string): void {
  if (results.length > 0) return;
  if (failures.length > 0) {
    throw new Error(failures.map((item) => `${getAppChain(item.chainId).name}: ${item.message}`).join(" | "));
  }
  throw new Error(fallbackMessage);
}

function dedupeProfiles(items: ApiProfileRecord[]): ApiProfileRecord[] {
  const byKey = new Map<string, ApiProfileRecord>();
  for (const item of items) {
    const key = `${item.slug}:${item.ownerAddress.toLowerCase()}:${item.collectionAddress || ""}`;
    if (!byKey.has(key)) {
      byKey.set(key, item);
    }
  }
  return [...byKey.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export function summarizeChainFailures(failures: ChainFailure[]): string {
  if (failures.length === 0) return "";
  return failures
    .map((item) => `${getAppChain(item.chainId).name}: ${item.message}`)
    .join(" | ");
}

export async function fetchProfileResolutionAcrossChains(
  name: string,
  chainIds = getEnabledAppChainIds()
): Promise<{ resolution: ApiProfileResolution; failures: ChainFailure[] }> {
  const mergedProfiles: ApiProfileRecord[] = [];
  const mergedCollections = new Map<string, NonNullable<ApiProfileResolution["collections"][number]>>();
  const sellerMap = new Map<string, string>();
  const failures: ChainFailure[] = [];
  let resolvedName = name;

  const results = await Promise.allSettled(
    chainIds.map(async (chainId) => {
      const resolution = await fetchProfileResolution(name, { chainId });
      return { chainId, resolution };
    })
  );

  for (const result of results) {
    if (result.status === "rejected") {
      continue;
    }
    resolvedName = result.value.resolution.name || resolvedName;
    for (const seller of result.value.resolution.sellers || []) {
      sellerMap.set(seller.toLowerCase(), seller);
    }
    for (const profile of result.value.resolution.profiles || []) {
      mergedProfiles.push(profile);
    }
    for (const collection of result.value.resolution.collections || []) {
      const normalized = {
        ...collection,
        chainId: collection.chainId || result.value.chainId
      };
      mergedCollections.set(`${normalized.chainId}:${normalized.contractAddress.toLowerCase()}`, normalized);
    }
  }

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      failures.push(toFailure(chainIds[index], result.reason));
    }
  });

  const profiles = dedupeProfiles(mergedProfiles);
  throwIfEveryChainFailed(profiles.length > 0 || mergedCollections.size > 0 || sellerMap.size > 0 ? [true] : [], failures, "Profile resolution failed.");

  return {
    resolution: {
      name: resolvedName,
      sellers: [...sellerMap.values()],
      profiles,
      collections: [...mergedCollections.values()]
    },
    failures
  };
}

export async function fetchActiveListingsAcrossChains(
  params: { limit: number; seller?: string },
  chainIds = getEnabledAppChainIds()
): Promise<{ items: ApiActiveListingItem[]; failures: ChainFailure[] }> {
  const failures: ChainFailure[] = [];
  const items: ApiActiveListingItem[] = [];

  const results = await Promise.allSettled(
    chainIds.map(async (chainId) => {
      const payload = await fetchActiveListings(0, params.limit, params.seller, { chainId });
      return { chainId, payload };
    })
  );

  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const chainId = chainIds[index];
    if (result.status === "rejected") {
      failures.push(toFailure(chainId, result.reason));
      continue;
    }
    for (const item of result.value.payload.items || []) {
      const normalizedToken = item.token
        ? ({
            ...item.token,
            collection: item.token.collection
              ? {
                  ...item.token.collection,
                  chainId: item.token.collection.chainId || chainId
                }
              : null
          } as ApiActiveListingItem["token"])
        : null;
      items.push({
        ...item,
        chainId,
        token: normalizedToken
      });
    }
  }

  throwIfEveryChainFailed(items, failures, "Active listing aggregation failed.");

  items.sort((a, b) => {
    const aTime = new Date(a.createdAt || a.updatedAt || 0).getTime();
    const bTime = new Date(b.createdAt || b.updatedAt || 0).getTime();
    if (aTime !== bTime) return bTime - aTime;
    if (a.id !== b.id) return b.id - a.id;
    return (b.chainId || 0) - (a.chainId || 0);
  });

  return { items, failures };
}

export async function fetchHiddenListingRecordIdsAcrossChains(
  chainIds = getEnabledAppChainIds()
): Promise<{ listingRecordIds: string[]; failures: ChainFailure[] }> {
  const failures: ChainFailure[] = [];
  const listingRecordIds = new Set<string>();

  const results = await Promise.allSettled(
    chainIds.map(async (chainId) => {
      const payload = await fetchHiddenListings({ chainId });
      return { chainId, payload };
    })
  );

  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const chainId = chainIds[index];
    if (result.status === "rejected") {
      failures.push(toFailure(chainId, result.reason));
      continue;
    }
    const payload: ApiHiddenListings = result.value.payload;
    for (const listingRecordId of payload.listingRecordIds || []) {
      listingRecordIds.add(`${chainId}:${listingRecordId}`);
    }
  }

  return {
    listingRecordIds: [...listingRecordIds],
    failures
  };
}

async function fetchUserOffersAcrossChains(
  ownerAddress: string,
  kind: "made" | "received",
  limit: number,
  chainIds = getEnabledAppChainIds()
): Promise<{ items: ApiOfferSummary[]; failures: ChainFailure[] }> {
  const failures: ChainFailure[] = [];
  const items: ApiOfferSummary[] = [];

  const results = await Promise.allSettled(
    chainIds.map(async (chainId) => {
      const payload =
        kind === "made"
          ? await fetchOffersMade(ownerAddress, 0, limit, { chainId })
          : await fetchOffersReceived(ownerAddress, 0, limit, { chainId });
      return { chainId, payload };
    })
  );

  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const chainId = chainIds[index];
    if (result.status === "rejected") {
      failures.push(toFailure(chainId, result.reason));
      continue;
    }
    for (const item of result.value.payload.items || []) {
      items.push({
        ...item,
        chainId: item.chainId || chainId
      });
    }
  }

  if (items.length === 0 && failures.length > 0) {
    throw new Error(summarizeChainFailures(failures));
  }

  items.sort((a, b) => {
    const aTime = new Date(a.createdAt || a.updatedAt || 0).getTime();
    const bTime = new Date(b.createdAt || b.updatedAt || 0).getTime();
    if (aTime !== bTime) return bTime - aTime;
    return Number.parseInt(b.offerId || b.id, 10) - Number.parseInt(a.offerId || a.id, 10);
  });

  return { items, failures };
}

export async function fetchOffersMadeAcrossChains(
  ownerAddress: string,
  limit: number,
  chainIds = getEnabledAppChainIds()
): Promise<{ items: ApiOfferSummary[]; failures: ChainFailure[] }> {
  return fetchUserOffersAcrossChains(ownerAddress, "made", limit, chainIds);
}

export async function fetchOffersReceivedAcrossChains(
  ownerAddress: string,
  limit: number,
  chainIds = getEnabledAppChainIds()
): Promise<{ items: ApiOfferSummary[]; failures: ChainFailure[] }> {
  return fetchUserOffersAcrossChains(ownerAddress, "received", limit, chainIds);
}

export async function fetchOwnerHoldingsAcrossChains(
  ownerAddress: string,
  options?: {
    standard?: "ERC721" | "ERC1155" | string | null;
    perPage?: number;
    maxPages?: number;
    chainIds?: number[];
  }
): Promise<{ items: ApiOwnerHoldingsResponse["items"]; failures: ChainFailure[] }> {
  const chainIds = options?.chainIds || getEnabledAppChainIds();
  const perPage = options?.perPage ?? 50;
  const maxPages = options?.maxPages ?? 1;
  const failures: ChainFailure[] = [];
  const items: ApiOwnerHoldingsResponse["items"] = [];

  for (const chainId of chainIds) {
    try {
      let cursor = 0;
      for (let page = 0; page < maxPages; page += 1) {
        const payload = await fetchOwnerHoldings(ownerAddress, cursor, perPage, {
          standard: options?.standard,
          chainId
        });
        for (const item of payload.items || []) {
          items.push({
            ...item,
            collection: item.collection
              ? {
                  ...item.collection,
                  chainId: item.collection.chainId || chainId
                }
              : null
          });
        }
        if (!payload.canLoadMore) break;
        cursor = payload.nextCursor;
      }
    } catch (error) {
      failures.push(toFailure(chainId, error));
    }
  }

  if (items.length === 0 && failures.length > 0) {
    throw new Error(summarizeChainFailures(failures));
  }

  items.sort((a, b) => new Date(b.mintedAt).getTime() - new Date(a.mintedAt).getTime());

  return { items, failures };
}
