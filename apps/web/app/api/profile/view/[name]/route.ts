import { NextResponse } from "next/server";
import type { ApiOwnerHoldingsResponse } from "../../../../../lib/indexerApi";
import {
  fetchActiveListingsAcrossChains,
  fetchHiddenListingRecordIdsAcrossChains,
  fetchOffersMadeAcrossChains,
  fetchOffersReceivedAcrossChains,
  fetchOwnerHoldingsAcrossChains,
  fetchProfileResolutionAcrossChains,
  type ChainFailure
} from "../../../../../lib/profileMultiChain";
import type { ApiProfileViewResponse } from "../../../../../lib/profileViewApi";

export const dynamic = "force-dynamic";
const HOLDINGS_PREVIEW_LIMIT = 24;

function isAddress(value: string | null | undefined): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || "").trim());
}

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message || fallback : fallback;
}

function pickActiveSellerAddresses(
  resolution: ApiProfileViewResponse["resolution"],
  manualSellerAddress: string | null
): string[] {
  if (isAddress(manualSellerAddress)) {
    return [manualSellerAddress];
  }

  const primaryOwner = resolution?.profiles?.find((item) => isAddress(item.ownerAddress))?.ownerAddress;
  if (isAddress(primaryOwner)) {
    return [primaryOwner];
  }

  const resolvedSeller = (resolution?.sellers || []).find((item) => isAddress(item));
  if (resolvedSeller) {
    return [resolvedSeller];
  }

  return [];
}

function dedupeHoldings(items: ApiOwnerHoldingsResponse["items"]): ApiOwnerHoldingsResponse["items"] {
  const deduped = new Map<string, ApiOwnerHoldingsResponse["items"][number]>();
  for (const item of items) {
    if (!item.collection) continue;
    const key = [
      item.collection.chainId || 0,
      item.ownerAddress.toLowerCase(),
      item.collection.contractAddress.toLowerCase(),
      item.tokenId
    ].join(":");
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

  return [...deduped.values()]
    .sort((a, b) => new Date(b.mintedAt).getTime() - new Date(a.mintedAt).getTime())
    .slice(0, HOLDINGS_PREVIEW_LIMIT);
}

function dedupeOffers(items: ApiProfileViewResponse["offers"]): ApiProfileViewResponse["offers"] {
  const deduped = new Map<string, ApiProfileViewResponse["offers"][number]>();
  for (const item of items) {
    const key = `${item.chainId || 0}:${item.offerId || item.id}`;
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, item);
      continue;
    }
    const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
    const nextTime = new Date(item.updatedAt || item.createdAt || 0).getTime();
    if (nextTime > existingTime) {
      deduped.set(key, item);
    }
  }

  return [...deduped.values()].sort((a, b) => {
    const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
    if (aTime !== bTime) return bTime - aTime;
    return Number.parseInt(b.offerId || b.id, 10) - Number.parseInt(a.offerId || a.id, 10);
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ name: string }> }
) {
  const params = await context.params;
  const name = decodeURIComponent(params.name || "").trim();
  if (!name) {
    return NextResponse.json({ error: "Profile name is required." }, { status: 400 });
  }

  const searchParams = new URL(request.url).searchParams;
  const manualSellerAddress = searchParams.get("seller");
  const limit = Math.min(parsePositiveInt(searchParams.get("limit"), 250), 1000);

  let resolution: ApiProfileViewResponse["resolution"] = null;
  let resolutionFailures: ChainFailure[] = [];
  let resolutionError: string | null = null;

  try {
    const result = await fetchProfileResolutionAcrossChains(name);
    resolution = result.resolution;
    resolutionFailures = result.failures || [];
  } catch (error) {
    resolutionError = toErrorMessage(error, "Profile resolution failed.");
  }

  const activeSellerAddresses = pickActiveSellerAddresses(resolution, manualSellerAddress);

  let listings: ApiProfileViewResponse["listings"] = [];
  let listingFailures: ChainFailure[] = [];
  let listingError: string | null = null;

  let hiddenListingRecordIds: string[] = [];
  let hiddenListingFailures: ChainFailure[] = [];
  let hiddenListingError: string | null = null;

  let offers: ApiProfileViewResponse["offers"] = [];
  let offerFailures: ChainFailure[] = [];
  let offerError: string | null = null;

  let holdings: ApiProfileViewResponse["holdings"] = [];
  let holdingsFailures: ChainFailure[] = [];
  let holdingsError: string | null = null;

  if (activeSellerAddresses.length > 0) {
    const activeSellerAddress = activeSellerAddresses[0];
    const [listingsResult, hiddenResult, offersMadeResult, offersReceivedResult, holdingsResult] = await Promise.allSettled([
      fetchActiveListingsAcrossChains({ limit, seller: activeSellerAddress }),
      fetchHiddenListingRecordIdsAcrossChains(),
      fetchOffersMadeAcrossChains(activeSellerAddress, limit),
      fetchOffersReceivedAcrossChains(activeSellerAddress, limit),
      fetchOwnerHoldingsAcrossChains(activeSellerAddress, {
        perPage: HOLDINGS_PREVIEW_LIMIT,
        maxPages: 2
      })
    ]);

    if (listingsResult.status === "fulfilled") {
      listings = listingsResult.value.items || [];
      listingFailures = listingsResult.value.failures || [];
    } else {
      listingError = toErrorMessage(listingsResult.reason, "Failed to load indexed creator listings.");
    }

    if (hiddenResult.status === "fulfilled") {
      hiddenListingRecordIds = hiddenResult.value.listingRecordIds || [];
      hiddenListingFailures = hiddenResult.value.failures || [];
    } else {
      hiddenListingError = toErrorMessage(
        hiddenResult.reason,
        "Indexer moderation filters are unavailable, so hidden-list filtering is currently disabled."
      );
    }

    const mergedOffers: ApiProfileViewResponse["offers"] = [];
    if (offersMadeResult.status === "fulfilled") {
      mergedOffers.push(...(offersMadeResult.value.items || []));
      offerFailures = [...offerFailures, ...(offersMadeResult.value.failures || [])];
    }
    if (offersReceivedResult.status === "fulfilled") {
      mergedOffers.push(...(offersReceivedResult.value.items || []));
      offerFailures = [...offerFailures, ...(offersReceivedResult.value.failures || [])];
    }
    offers = dedupeOffers(mergedOffers);
    if (offersMadeResult.status === "rejected" && offersReceivedResult.status === "rejected") {
      offerError = [
        toErrorMessage(offersMadeResult.reason, "Failed to load indexed offers made."),
        toErrorMessage(offersReceivedResult.reason, "Failed to load indexed offers received.")
      ].join(" | ");
    }

    if (holdingsResult.status === "fulfilled") {
      holdings = dedupeHoldings((holdingsResult.value.items || []).filter((item) => item.collection));
      holdingsFailures = holdingsResult.value.failures || [];
    } else {
      holdingsError = toErrorMessage(holdingsResult.reason, "Failed to load indexed holdings.");
    }
  }

  const payload: ApiProfileViewResponse = {
    name,
    resolution,
    resolutionFailures,
    resolutionError,
    activeSellerAddresses,
    listings,
    listingFailures,
    listingError,
    hiddenListingRecordIds,
    hiddenListingFailures,
    hiddenListingError,
    offers,
    offerFailures,
    offerError,
    holdings,
    holdingsFailures,
    holdingsError
  };

  return NextResponse.json(payload);
}
