import { getEnabledAppChainIds } from "./chains";
import {
  fetchCollectionsByOwner,
  fetchProfilesByOwner,
  type ApiOwnedCollections,
  type ApiOwnedProfiles,
  type ApiProfileRecord
} from "./indexerApi";

function dedupeProfiles(items: ApiProfileRecord[]): ApiProfileRecord[] {
  const byKey = new Map<string, ApiProfileRecord>();
  for (const item of items) {
    const key = `${item.slug}:${item.ownerAddress.toLowerCase()}:${item.collectionAddress || ""}:${item.source}`;
    if (!byKey.has(key)) {
      byKey.set(key, item);
    }
  }
  return [...byKey.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
}

function dedupeCollections(items: ApiOwnedCollections["collections"]): ApiOwnedCollections["collections"] {
  const byKey = new Map<string, ApiOwnedCollections["collections"][number]>();
  for (const item of items) {
    const key = `${item.chainId}:${item.contractAddress.toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      continue;
    }
    const existingUpdatedAt = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
    const nextUpdatedAt = new Date(item.updatedAt || item.createdAt || 0).getTime();
    if (nextUpdatedAt >= existingUpdatedAt) {
      byKey.set(key, item);
    }
  }
  return [...byKey.values()].sort((a, b) => {
    const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return bTime - aTime;
  });
}

export async function fetchProfilesByOwnerAcrossChains(
  ownerAddress: string,
  chainIds = getEnabledAppChainIds()
): Promise<ApiOwnedProfiles> {
  const results = await Promise.allSettled(
    chainIds.map((chainId) => fetchProfilesByOwner(ownerAddress, { chainId }))
  );
  const profiles = results
    .filter((result): result is PromiseFulfilledResult<ApiOwnedProfiles> => result.status === "fulfilled")
    .flatMap((result) => result.value.profiles || []);

  if (profiles.length === 0 && results.every((result) => result.status === "rejected")) {
    throw new Error("Failed to load linked profiles across configured chains.");
  }

  return {
    ownerAddress,
    profiles: dedupeProfiles(profiles)
  };
}

export async function fetchCollectionsByOwnerAcrossChains(
  ownerAddress: string,
  chainIds = getEnabledAppChainIds()
): Promise<ApiOwnedCollections> {
  const results = await Promise.allSettled(
    chainIds.map((chainId) => fetchCollectionsByOwner(ownerAddress, { chainId }))
  );
  const collections = results
    .filter((result): result is PromiseFulfilledResult<ApiOwnedCollections> => result.status === "fulfilled")
    .flatMap((result) => result.value.collections || []);

  if (collections.length === 0 && results.every((result) => result.status === "rejected")) {
    throw new Error("Failed to load owned collections across configured chains.");
  }

  return {
    ownerAddress,
    collections: dedupeCollections(collections)
  };
}
