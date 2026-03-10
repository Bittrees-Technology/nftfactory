import { NextResponse } from "next/server";
import type { ApiMintFeedItem, ApiOwnerHoldingsResponse } from "../../../../lib/indexerApi";
import { fetchMintFeed } from "../../../../lib/indexerApi";
import { getEnabledAppChainIds } from "../../../../lib/chains";
import {
  fetchActiveListingsAcrossChains,
  fetchOwnerHoldingsAcrossChains,
  type ChainFailure
} from "../../../../lib/profileMultiChain";
import type { ApiListingManagementViewResponse, ListingManagementInventoryItem } from "../../../../lib/listingManagementApi";

export const dynamic = "force-dynamic";

function isAddress(value: string | null | undefined): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || "").trim());
}

function parseChainId(value: string | null): number | null {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeChainIds(chainId: number | null): number[] {
  const enabledChainIds = getEnabledAppChainIds();
  if (chainId && enabledChainIds.includes(chainId)) {
    return [chainId];
  }
  return enabledChainIds;
}

function normalizeInventoryItem(
  item: ListingManagementInventoryItem,
  chainId: number
): ListingManagementInventoryItem {
  return {
    ...item,
    collection: item.collection
      ? {
          ...item.collection,
          chainId: item.collection.chainId || chainId
        }
      : null
  };
}

function inventoryItemKey(item: ListingManagementInventoryItem): string | null {
  if (!item.collection) return null;
  return `${item.collection.chainId || 0}:${item.collection.contractAddress.toLowerCase()}:${item.tokenId}`;
}

function dedupeInventoryItems(items: ListingManagementInventoryItem[]): ListingManagementInventoryItem[] {
  const deduped = new Map<string, ListingManagementInventoryItem>();
  for (const item of items) {
    const key = inventoryItemKey(item);
    if (!key) continue;
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, item);
      continue;
    }
    const existingTime = new Date(existing.mintedAt).getTime();
    const nextTime = new Date(item.mintedAt).getTime();
    if (nextTime > existingTime) {
      deduped.set(key, item);
    }
  }
  return [...deduped.values()].sort((a, b) => new Date(b.mintedAt).getTime() - new Date(a.mintedAt).getTime());
}

function toFailure(chainId: number, error: unknown): ChainFailure {
  return {
    chainId,
    message: error instanceof Error ? error.message : `Failed to load chain ${chainId}`
  };
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message || fallback : fallback;
}

async function fetchFallbackInventory(
  ownerAddress: string,
  standard: "ERC721" | "ERC1155",
  chainIds: number[]
): Promise<{ items: ListingManagementInventoryItem[]; failures: ChainFailure[] }> {
  const normalizedOwner = ownerAddress.toLowerCase();
  const results = await Promise.allSettled(
    chainIds.map(async (chainId) => {
      const rows: ApiMintFeedItem[] = [];
      let cursor = 0;
      for (let page = 0; page < 4; page += 1) {
        const feed = await fetchMintFeed(cursor, 100, { chainId });
        for (const item of feed.items || []) {
          if (!item.collection) continue;
          if (item.ownerAddress.toLowerCase() !== normalizedOwner) continue;
          if (item.collection.standard !== standard) continue;
          rows.push(normalizeInventoryItem(item, chainId) as ApiMintFeedItem);
        }
        if (!feed.canLoadMore) break;
        cursor = feed.nextCursor;
      }
      return { chainId, rows };
    })
  );

  const items: ListingManagementInventoryItem[] = [];
  const failures: ChainFailure[] = [];
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const chainId = chainIds[index];
    if (result.status === "rejected") {
      failures.push(toFailure(chainId, result.reason));
      continue;
    }
    items.push(...result.value.rows);
  }
  return {
    items: dedupeInventoryItems(items),
    failures
  };
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const ownerAddress = searchParams.get("owner");
  if (!isAddress(ownerAddress)) {
    return NextResponse.json({ error: "Valid owner address is required." }, { status: 400 });
  }

  const standardValue = String(searchParams.get("standard") || "").trim().toUpperCase();
  const standard = standardValue === "ERC1155" ? "ERC1155" : "ERC721";
  const chainIds = normalizeChainIds(parseChainId(searchParams.get("chainId")));

  let inventoryItems: ListingManagementInventoryItem[] = [];
  let inventoryFailures: ChainFailure[] = [];
  let inventoryError: string | null = null;

  let listingItems: ApiListingManagementViewResponse["listingItems"] = [];
  let listingFailures: ChainFailure[] = [];
  let listingError: string | null = null;

  const [inventoryResult, listingsResult] = await Promise.allSettled([
    fetchOwnerHoldingsAcrossChains(ownerAddress, {
      standard,
      perPage: 100,
      maxPages: 20,
      chainIds
    }),
    fetchActiveListingsAcrossChains({ limit: 1000, seller: ownerAddress }, chainIds)
  ]);

  if (inventoryResult.status === "fulfilled") {
    inventoryItems = dedupeInventoryItems(
      (inventoryResult.value.items || []).map((item) =>
        normalizeInventoryItem(item, item.collection?.chainId || chainIds[0] || 0)
      )
    );
    inventoryFailures = inventoryResult.value.failures || [];
  } else {
    inventoryError = toErrorMessage(inventoryResult.reason, "Failed to load owned NFTs.");
  }

  if (inventoryItems.length === 0 && !inventoryError) {
    try {
      const fallbackInventory = await fetchFallbackInventory(ownerAddress, standard, chainIds);
      inventoryItems = fallbackInventory.items;
      inventoryFailures = [...inventoryFailures, ...(fallbackInventory.failures || [])];
    } catch (error) {
      inventoryError = toErrorMessage(error, "Failed to load owned NFTs.");
    }
  }

  if (listingsResult.status === "fulfilled") {
    listingItems = listingsResult.value.items || [];
    listingFailures = listingsResult.value.failures || [];
  } else {
    listingError = toErrorMessage(listingsResult.reason, "Failed to load listings.");
  }

  const payload: ApiListingManagementViewResponse = {
    ownerAddress,
    chainIds,
    inventoryItems,
    inventoryFailures,
    inventoryError,
    listingItems,
    listingFailures,
    listingError
  };

  return NextResponse.json(payload);
}
