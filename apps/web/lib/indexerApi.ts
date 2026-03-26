import {
  getLegacyChainPublicEnv,
  getScopedChainPublicEnv
} from "./publicEnv";
import { isPrivateOrLocalUrl } from "./ipfsUpload";
import { normalizeBackendFetchError } from "./networkErrors";

export type IndexerRequestOptions = {
  chainId?: number;
  baseUrl?: string;
};

export function getIndexerBaseUrl(options?: IndexerRequestOptions): string {
  if (options?.baseUrl) return options.baseUrl;
  if (options?.chainId) {
    const scoped = getScopedChainPublicEnv("NEXT_PUBLIC_INDEXER_API_URL", options.chainId);
    if (scoped) return scoped;
  }
  const legacy = getLegacyChainPublicEnv("NEXT_PUBLIC_INDEXER_API_URL");
  if (legacy) {
    return legacy;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_INDEXER_API_URL is not configured for this deployment.");
  }
  return "http://127.0.0.1:8787";
}

const INDEXER_REQUEST_TIMEOUT_MS = 12_000;

function withTimeout(
  init?: RequestInit,
  timeoutMs = INDEXER_REQUEST_TIMEOUT_MS
): { init: RequestInit; cleanup: () => void } {
  if (timeoutMs <= 0) {
    return {
      init: { ...init },
      cleanup: () => {}
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return {
    init: {
      ...init,
      signal: controller.signal
    },
    cleanup: () => clearTimeout(timeout)
  };
}

async function fetchJson<T>(path: string, init?: RequestInit, timeoutMs?: number, options?: IndexerRequestOptions): Promise<T> {
  const effectiveTimeoutMs = timeoutMs ?? INDEXER_REQUEST_TIMEOUT_MS;
  const { init: requestInit, cleanup } = withTimeout(init, effectiveTimeoutMs);
  const baseUrl = getIndexerBaseUrl(options);

  if (process.env.NODE_ENV === "production" && isPrivateOrLocalUrl(baseUrl)) {
    throw new Error(
      `Indexer API ${baseUrl} is not reachable from this deployment. Set NEXT_PUBLIC_INDEXER_API_URL to a public HTTP(S) endpoint.`
    );
  }

  try {
    const response = await fetch(`${baseUrl}${path}`, {
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
      throw new Error(`Indexer request timed out after ${effectiveTimeoutMs}ms`);
    }
    throw normalizeBackendFetchError(error, {
      serviceLabel: "Indexer API",
      envVarName: "NEXT_PUBLIC_INDEXER_API_URL",
      baseUrl
    });
  } finally {
    cleanup();
  }
}

export type ApiHiddenListings = {
  listingIds: number[];
  listingRecordIds: string[];
};

export type ApiPaymentTokenRecord = {
  tokenAddress: string;
  firstSeenAt: string;
  lastSeenAt: string;
  firstSellerAddress: string;
  lastSellerAddress: string;
  useCount: number;
  status: "pending" | "approved" | "flagged";
  notes: string | null;
  onchainAllowed?: boolean | null;
};

export type ApiProfileResolution = {
  name: string;
  sellers: string[];
  profiles?: ApiProfileRecord[];
  collections: Array<{
    chainId?: number;
    ensSubname: string | null;
    contractAddress: string;
    ownerAddress: string;
    createdAt?: string;
    updatedAt?: string;
  }>;
};

export type ApiProfileRecord = {
  slug: string;
  fullName: string;
  source: "ens" | "external-subname" | "nftfactory-subname";
  ownerAddress: string;
  collectionAddress: string | null;
  tagline: string | null;
  displayName: string | null;
  bio: string | null;
  layoutMode: "default" | "myspace" | null;
  aboutMe: string | null;
  interests: string | null;
  whoIdLikeToMeet: string | null;
  topFriends: string[];
  testimonials: string[];
  profileSongUrl: string | null;
  bannerUrl: string | null;
  avatarUrl: string | null;
  featuredUrl: string | null;
  accentColor: string | null;
  customCss: string | null;
  customHtml: string | null;
  links: string[];
  createdAt: string;
  updatedAt: string;
};

export type ApiOwnedCollections = {
  ownerAddress: string;
  collections: Array<{
    chainId: number;
    ensSubname: string | null;
    contractAddress: string;
    ownerAddress: string;
    standard: string;
    isFactoryCreated: boolean;
    isUpgradeable: boolean;
    finalizedAt: string | null;
    createdAt: string;
    updatedAt: string;
    tokenCount: number;
    activeListingCount: number;
  }>;
};

export type ApiOwnedProfiles = {
  ownerAddress: string;
  profiles: ApiProfileRecord[];
};

export type ApiProfileGuestbookEntry = {
  id: string;
  profileSlug: string;
  authorName: string;
  message: string;
  createdAt: string;
};

export type ApiProfileGuestbookResponse = {
  profileSlug: string;
  entries: ApiProfileGuestbookEntry[];
};

export type ApiOfferSummary = {
  id: string;
  offerId: string;
  chainId: number;
  marketplaceVersion: string;
  collectionAddress: string;
  tokenId: string;
  standard: string;
  currentOwnerAddress: string | null;
  currentOwnerAddresses: string[];
  buyerAddress: string;
  paymentToken: string;
  quantityRaw: string;
  priceRaw: string;
  expiresAtRaw: string;
  status: string;
  active: boolean;
  acceptedByAddress: string | null;
  acceptedSellerAddress: string | null;
  acceptedTxHash: string | null;
  cancelledTxHash: string | null;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt: string;
};

export type ApiTokenActiveListing = {
  listingId: string;
  listingRecordId?: string;
  marketplaceVersion?: string;
  marketplaceAddress?: string | null;
  sellerAddress: string;
  paymentToken: string;
  priceRaw: string;
  amountRaw?: string | null;
  standard?: string | null;
  expiresAtRaw?: string | null;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
  lastSyncedAt?: string | null;
};

export type ApiMintFeedItem = {
  id: string;
  tokenId: string;
  creatorAddress: string;
  ownerAddress: string;
  currentOwnerAddress?: string | null;
  currentOwnerAddresses?: string[];
  heldAmountRaw?: string | null;
  reservedAmountRaw?: string | null;
  availableAmountRaw?: string | null;
  mintTxHash?: string | null;
  draftName?: string | null;
  draftDescription?: string | null;
  mintedAmountRaw?: string | null;
  metadataCid: string;
  metadataUrl?: string | null;
  mediaCid: string | null;
  mediaUrl?: string | null;
  immutable: boolean;
  mintedAt: string;
  bestOffer?: ApiOfferSummary | null;
  offerCount?: number;
  collection: {
    chainId: number;
    contractAddress: string;
    ownerAddress: string;
    ensSubname: string | null;
    standard: string;
    isFactoryCreated: boolean;
    isUpgradeable?: boolean;
    finalizedAt?: string | null;
    createdAt?: string;
    updatedAt?: string;
  };
  activeListing: ApiTokenActiveListing | null;
};

export type ApiMintFeedResponse = {
  cursor: number;
  nextCursor: number;
  canLoadMore: boolean;
  items: ApiMintFeedItem[];
};

export type ApiOwnerHoldingsResponse = {
  ownerAddress: string;
  cursor: number;
  nextCursor: number;
  canLoadMore: boolean;
  items: Array<
    Omit<ApiMintFeedItem, "collection"> & {
      collection: ApiMintFeedItem["collection"] | null;
    }
  >;
};

export type ApiActiveListingItem = {
  id: number;
  chainId?: number;
  listingId: string;
  listingRecordId?: string;
  marketplaceVersion: string;
  marketplaceAddress?: string | null;
  sellerAddress: string;
  collectionAddress: string;
  tokenId: string;
  amountRaw: string;
  standard: string;
  paymentToken: string;
  priceRaw: string;
  expiresAtRaw: string;
  active: boolean;
  buyerAddress: string | null;
  txHash: string | null;
  cancelledAt: string | null;
  soldAt: string | null;
  lastSyncedAt: string;
  createdAt: string;
  updatedAt: string;
  token: (Omit<ApiMintFeedItem, "activeListing"> & {
    collection: ApiMintFeedItem["collection"] | null;
  }) | null;
};

export type ApiActiveListingsResponse = {
  cursor: number;
  nextCursor: number;
  canLoadMore: boolean;
  items: ApiActiveListingItem[];
};

export type ApiOwnerSummary = {
  ownerAddress: string;
  counts: {
    linkedProfiles: number;
    ownedCollections: number;
    ownedTokens: number;
    createdTokens: number;
    activeListings: number;
    offersMade: number;
    offersReceived: number;
  };
  profiles: ApiProfileRecord[];
  collections: ApiOwnedCollections["collections"];
  factoryCollections: Array<{
    chainId: number;
    contractAddress: string;
    ownerAddress: string;
    ensSubname: string | null;
    standard: string;
    isFactoryCreated: boolean;
    isUpgradeable: boolean;
    finalizedAt: string | null;
    createdAt: string;
    updatedAt: string;
    tokenCount: number;
    tokens: Array<{
      id: string;
      tokenId: string;
      creatorAddress: string;
      ownerAddress: string;
      draftName?: string | null;
      draftDescription?: string | null;
      mintedAmountRaw?: string | null;
      metadataCid: string;
      metadataUrl: string | null;
      mediaCid: string | null;
      mediaUrl: string | null;
      immutable: boolean;
      mintedAt: string;
      bestOffer?: ApiOfferSummary | null;
      offerCount?: number;
      activeListing: ApiMintFeedItem["activeListing"];
    }>;
  }>;
  recentOwnedMints: Array<{
    id: string;
    tokenId: string;
    creatorAddress: string;
    ownerAddress: string;
    heldAmountRaw?: string | null;
    reservedAmountRaw?: string | null;
    availableAmountRaw?: string | null;
    mintTxHash: string | null;
    draftName?: string | null;
    draftDescription?: string | null;
    mintedAmountRaw?: string | null;
    metadataCid: string;
    metadataUrl: string | null;
    mediaCid: string | null;
    mediaUrl: string | null;
    mintedAt: string;
    bestOffer?: ApiOfferSummary | null;
    offerCount?: number;
    activeListing: ApiMintFeedItem["activeListing"];
    collection: {
      contractAddress: string;
      ensSubname: string | null;
      standard: string;
      isFactoryCreated: boolean;
    };
  }>;
  recentOffersMade: ApiOfferSummary[];
  recentOffersReceived: ApiOfferSummary[];
};

export type ApiCollectionTokens = {
  contractAddress: string;
  count: number;
  tokens: Array<
    Omit<ApiMintFeedItem, "collection"> & {
      collection: ApiMintFeedItem["collection"];
    }
  >;
};

export type ApiOffersResponse = {
  cursor: number;
  nextCursor: number;
  canLoadMore: boolean;
  items: ApiOfferSummary[];
};

export type ApiUserOffersResponse = ApiOffersResponse & {
  ownerAddress: string;
};

export async function fetchHiddenListings(options?: IndexerRequestOptions): Promise<ApiHiddenListings> {
  const payload = await fetchJson<ApiHiddenListings>("/api/moderation/hidden-listings", undefined, undefined, options);
  return {
    listingIds: payload.listingIds || [],
    listingRecordIds: payload.listingRecordIds || []
  };
}

export async function fetchHiddenListingIds(): Promise<number[]> {
  const payload = await fetchHiddenListings();
  return payload.listingIds;
}

export async function createModerationReport(payload: {
  listingId?: number;
  listingRecordId?: string;
  marketplaceVersion?: string;
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

export async function logPaymentTokenUsage(payload: {
  tokenAddress: string;
  sellerAddress: string;
  listingIds?: Array<number | string>;
}): Promise<ApiPaymentTokenRecord[]> {
  const response = await fetchJson<{ tokens: ApiPaymentTokenRecord[] }>("/api/payment-tokens/log", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return response.tokens || [];
}

export async function fetchProfileResolution(name: string, options?: IndexerRequestOptions): Promise<ApiProfileResolution> {
  return fetchJson<ApiProfileResolution>(`/api/profile/${encodeURIComponent(name)}`, undefined, undefined, options);
}

export async function fetchCollectionsByOwner(ownerAddress: string, options?: IndexerRequestOptions): Promise<ApiOwnedCollections> {
  return fetchJson<ApiOwnedCollections>(`/api/collections?owner=${encodeURIComponent(ownerAddress)}`, undefined, undefined, options);
}

export async function fetchProfilesByOwner(ownerAddress: string, options?: IndexerRequestOptions): Promise<ApiOwnedProfiles> {
  return fetchJson<ApiOwnedProfiles>(`/api/profiles?owner=${encodeURIComponent(ownerAddress)}`, undefined, undefined, options);
}

export async function fetchMintFeed(
  cursor = 0,
  limit = 50,
  options?: IndexerRequestOptions
): Promise<ApiMintFeedResponse> {
  return fetchJson<ApiMintFeedResponse>(
    `/api/feed?cursor=${encodeURIComponent(String(cursor))}&limit=${encodeURIComponent(String(limit))}`,
    undefined,
    undefined,
    options
  );
}

export async function fetchActiveListings(
  cursor = 0,
  limit = 50,
  seller?: string,
  options?: { includeAllMarkets?: boolean } & IndexerRequestOptions
): Promise<ApiActiveListingsResponse> {
  const params = new URLSearchParams();
  params.set("cursor", String(cursor));
  params.set("limit", String(limit));
  if (seller) {
    params.set("seller", seller);
  }
  if (options?.includeAllMarkets) {
    params.set("includeAllMarkets", "true");
  }
  return fetchJson<ApiActiveListingsResponse>(`/api/listings?${params.toString()}`, undefined, undefined, options);
}

export async function fetchOffersMade(
  ownerAddress: string,
  cursor = 0,
  limit = 50,
  options?: IndexerRequestOptions
): Promise<ApiUserOffersResponse> {
  return fetchJson<ApiUserOffersResponse>(
    `/api/users/${encodeURIComponent(ownerAddress)}/offers-made?cursor=${encodeURIComponent(String(cursor))}&limit=${encodeURIComponent(String(limit))}`,
    undefined,
    undefined,
    options
  );
}

export async function fetchOffersReceived(
  ownerAddress: string,
  cursor = 0,
  limit = 50,
  options?: IndexerRequestOptions
): Promise<ApiUserOffersResponse> {
  return fetchJson<ApiUserOffersResponse>(
    `/api/users/${encodeURIComponent(ownerAddress)}/offers-received?cursor=${encodeURIComponent(String(cursor))}&limit=${encodeURIComponent(String(limit))}`,
    undefined,
    undefined,
    options
  );
}

export async function fetchOwnerSummary(ownerAddress: string): Promise<ApiOwnerSummary> {
  return fetchJson<ApiOwnerSummary>(`/api/owners/${encodeURIComponent(ownerAddress)}/summary`);
}

export async function fetchOwnerHoldings(
  ownerAddress: string,
  cursor = 0,
  limit = 50,
  options?: { standard?: "ERC721" | "ERC1155" | string | null } & IndexerRequestOptions
): Promise<ApiOwnerHoldingsResponse> {
  const params = new URLSearchParams({
    cursor: String(cursor),
    limit: String(limit)
  });
  const standard = String(options?.standard || "").trim().toUpperCase();
  if (standard === "ERC721" || standard === "ERC1155") {
    params.set("standard", standard);
  }
  return fetchJson<ApiOwnerHoldingsResponse>(
    `/api/users/${encodeURIComponent(ownerAddress)}/holdings?${params.toString()}`,
    undefined,
    undefined,
    options
  );
}

export async function fetchCollectionTokens(
  contractAddress: string,
  options?: IndexerRequestOptions & { sync?: boolean }
): Promise<ApiCollectionTokens> {
  const params = new URLSearchParams();
  if (options?.sync) {
    params.set("sync", "1");
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return fetchJson<ApiCollectionTokens>(
    `/api/collections/${encodeURIComponent(contractAddress)}/tokens${suffix}`,
    undefined,
    undefined,
    options
  );
}

export async function syncMintedToken(payload: {
  chainId: number;
  contractAddress: string;
  collectionOwnerAddress?: string;
  tokenId: string;
  creatorAddress: string;
  ownerAddress: string;
  standard: string;
  isFactoryCreated: boolean;
  isUpgradeable: boolean;
  ensSubname?: string | null;
  collectionCreatedAt?: string | null;
  finalizedAt?: string | null;
  mintTxHash?: string | null;
  draftName?: string | null;
  draftDescription?: string | null;
  mintedAmountRaw?: string | null;
  metadataCid: string;
  mediaCid?: string | null;
  immutable: boolean;
  mintedAt?: string;
}): Promise<{ ok: boolean; token: ApiMintFeedItem }> {
  return fetchJson<{ ok: boolean; token: ApiMintFeedItem }>("/api/tokens/sync", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function linkProfileIdentity(payload: {
  name: string;
  source: ApiProfileRecord["source"];
  ownerAddress: string;
  routeSlug?: string;
  collectionAddress?: string;
  tagline?: string;
  displayName?: string;
  bio?: string;
  layoutMode?: "default" | "myspace";
  aboutMe?: string;
  interests?: string;
  whoIdLikeToMeet?: string;
  topFriends?: string[];
  testimonials?: string[];
  profileSongUrl?: string;
  bannerUrl?: string;
  avatarUrl?: string;
  featuredUrl?: string;
  accentColor?: string;
  customCss?: string;
  customHtml?: string;
  links?: string[];
}): Promise<{ ok: boolean; profile: ApiProfileRecord }> {
  return fetchJson<{ ok: boolean; profile: ApiProfileRecord }>("/api/profiles/link", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function transferProfileOwnership(payload: {
  slug: string;
  currentOwnerAddress: string;
  newOwnerAddress: string;
}): Promise<{ ok: boolean; profile: ApiProfileRecord }> {
  return fetchJson<{ ok: boolean; profile: ApiProfileRecord }>("/api/profiles/transfer", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}


export async function fetchProfileGuestbook(name: string, options?: IndexerRequestOptions): Promise<ApiProfileGuestbookResponse> {
  return fetchJson<ApiProfileGuestbookResponse>(`/api/profile/${encodeURIComponent(name)}/guestbook`, undefined, undefined, options);
}

export async function createProfileGuestbookEntry(payload: {
  name: string;
  authorName: string;
  message: string;
}, options?: IndexerRequestOptions): Promise<{ ok: boolean; entry: ApiProfileGuestbookEntry }> {
  return fetchJson<{ ok: boolean; entry: ApiProfileGuestbookEntry }>(`/api/profile/${encodeURIComponent(payload.name)}/guestbook`, {
    method: "POST",
    body: JSON.stringify({
      authorName: payload.authorName,
      message: payload.message
    })
  }, undefined, options);
}
