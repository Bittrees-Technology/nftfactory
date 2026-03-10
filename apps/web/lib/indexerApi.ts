import {
  getLegacyChainPublicEnv,
  getScopedChainPublicEnv
} from "./publicEnv";

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
  return getLegacyChainPublicEnv("NEXT_PUBLIC_INDEXER_API_URL") || "http://127.0.0.1:8787";
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
  try {
    const response = await fetch(`${getIndexerBaseUrl(options)}${path}`, {
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
  listingRecordId?: string | null;
  marketplaceVersion?: string | null;
  listing?: ApiActiveListingItem | null;
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
  listingRecordId?: string | null;
  marketplaceVersion?: string | null;
  listing?: ApiActiveListingItem | null;
  createdAt: string;
};

export type ApiHiddenListings = {
  listingIds: number[];
  listingRecordIds: string[];
};

export type ApiModerator = {
  address: string;
  label: string | null;
  addedAt: string;
  updatedAt: string;
};

export type ApiModeratorsResponse = {
  moderators: ApiModerator[];
  source?: "local" | "onchain+local";
  moderatorRegistryAddress?: string | null;
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
  bannerUrl: string | null;
  avatarUrl: string | null;
  featuredUrl: string | null;
  accentColor: string | null;
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

export type ApiIndexerOverview = {
  chainId: number;
  counts: {
    collections: number;
    tokens: number;
    activeListings: number;
    openReports: number;
    hiddenListings: number;
    linkedProfiles: number;
    trackedPaymentTokens: number;
    moderators: number;
  };
  generatedAt: string;
};

export type ApiIndexerHealth = {
  ok: boolean;
  service: string;
  contracts?: {
    registryAddress?: string | null;
    moderatorRegistryAddress?: string | null;
  };
  schema?: {
    mintTxHashColumnAvailable?: boolean;
    tokenPresentationColumnsAvailable?: boolean;
    listingV2ColumnsAvailable?: boolean;
    offerTableAvailable?: boolean;
    tokenHoldingTableAvailable?: boolean;
  };
  marketplace?: {
    configured?: boolean;
    syncInProgress?: boolean;
    lastListingSyncAt?: string | null;
    lastListingSyncCount?: number;
    v2Configured?: boolean;
    v2SyncInProgress?: boolean;
    lastMarketplaceV2SyncAt?: string | null;
    v2ListingSyncInProgress?: boolean;
    v2OfferSyncInProgress?: boolean;
    lastMarketplaceV2ListingSyncAt?: string | null;
    lastMarketplaceV2OfferSyncAt?: string | null;
    lastMarketplaceV2ListingSyncCount?: number;
    lastOfferSyncCount?: number;
  };
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
  listingId?: number;
  listingRecordId?: string;
  hidden: boolean;
  actor: string;
  notes?: string;
  auth?: AdminAuth;
}): Promise<void> {
  const listingRef = String(payload.listingRecordId ?? payload.listingId ?? "").trim();
  if (!listingRef) {
    throw new Error("A listing reference is required.");
  }
  await fetchJson(`/api/moderation/listings/${encodeURIComponent(listingRef)}/visibility`, {
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

export async function fetchModerators(auth?: AdminAuth): Promise<ApiModeratorsResponse> {
  const payload = await fetchJson<ApiModeratorsResponse>("/api/admin/moderators", {
    headers: adminHeaders(auth)
  });
  return {
    moderators: payload.moderators || [],
    source: payload.source || "local",
    moderatorRegistryAddress: payload.moderatorRegistryAddress || null
  };
}

export async function updateModerator(payload: {
  address: string;
  label?: string;
  enabled?: boolean;
  auth?: AdminAuth;
}): Promise<ApiModerator[]> {
  const response = await fetchJson<{ moderators: ApiModerator[] }>("/api/admin/moderators", {
    method: "POST",
    headers: adminHeaders(payload.auth),
    body: JSON.stringify({
      address: payload.address,
      label: payload.label,
      enabled: payload.enabled
    })
  });
  return response.moderators || [];
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

export async function fetchTrackedPaymentTokens(auth?: AdminAuth): Promise<ApiPaymentTokenRecord[]> {
  const response = await fetchJson<{ tokens: ApiPaymentTokenRecord[] }>("/api/admin/payment-tokens", {
    headers: adminHeaders(auth)
  });
  return response.tokens || [];
}

export async function reviewTrackedPaymentToken(payload: {
  tokenAddress: string;
  status?: "pending" | "approved" | "flagged";
  notes?: string;
  auth?: AdminAuth;
}): Promise<ApiPaymentTokenRecord[]> {
  const response = await fetchJson<{ tokens: ApiPaymentTokenRecord[] }>("/api/admin/payment-tokens", {
    method: "POST",
    headers: adminHeaders(payload.auth),
    body: JSON.stringify({
      tokenAddress: payload.tokenAddress,
      status: payload.status,
      notes: payload.notes
    })
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

export async function fetchOffers(params?: {
  cursor?: number;
  limit?: number;
  buyer?: string;
  collectionAddress?: string;
  tokenId?: string;
  status?: string;
  active?: boolean;
  chainId?: number;
  baseUrl?: string;
}): Promise<ApiOffersResponse> {
  const query = new URLSearchParams();
  query.set("cursor", String(params?.cursor ?? 0));
  query.set("limit", String(params?.limit ?? 50));
  if (params?.buyer) {
    query.set("buyer", params.buyer);
  }
  if (params?.collectionAddress) {
    query.set("collectionAddress", params.collectionAddress);
  }
  if (params?.tokenId) {
    query.set("tokenId", params.tokenId);
  }
  if (params?.status) {
    query.set("status", params.status);
  }
  if (typeof params?.active === "boolean") {
    query.set("active", String(params.active));
  }
  return fetchJson<ApiOffersResponse>(`/api/offers?${query.toString()}`, undefined, undefined, {
    chainId: params?.chainId,
    baseUrl: params?.baseUrl
  });
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

export async function fetchIndexerOverview(): Promise<ApiIndexerOverview> {
  return fetchJson<ApiIndexerOverview>("/api/overview");
}

export async function fetchIndexerHealth(): Promise<ApiIndexerHealth> {
  return fetchJson<ApiIndexerHealth>("/health");
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

export async function fetchCollectionTokens(contractAddress: string): Promise<ApiCollectionTokens> {
  return fetchJson<ApiCollectionTokens>(`/api/collections/${encodeURIComponent(contractAddress)}/tokens`);
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
  bannerUrl?: string;
  avatarUrl?: string;
  featuredUrl?: string;
  accentColor?: string;
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

export async function backfillCollectionTokens(payload: {
  contractAddress: string;
  ownerAddress?: string;
  standard?: "ERC721" | "ERC1155";
  ensSubname?: string | null;
  isFactoryCreated?: boolean;
  isUpgradeable?: boolean;
  auth?: AdminAuth;
}): Promise<{ ok: boolean; scanned: number; upserted: number; standard: string; ownerAddress: string | null }> {
  return fetchJson<{ ok: boolean; scanned: number; upserted: number; standard: string; ownerAddress: string | null }>(
    "/api/admin/collections/backfill-tokens",
    {
      method: "POST",
      headers: adminHeaders(payload.auth),
      body: JSON.stringify({
        contractAddress: payload.contractAddress,
        ownerAddress: payload.ownerAddress,
        standard: payload.standard,
        ensSubname: payload.ensSubname,
        isFactoryCreated: payload.isFactoryCreated,
        isUpgradeable: payload.isUpgradeable
      })
    }
  );
}

export async function backfillRegistryCollections(payload?: {
  fromBlock?: number;
  auth?: AdminAuth;
}): Promise<{ ok: boolean; discovered: number; scanned: number; upserted: number }> {
  return fetchJson<{ ok: boolean; discovered: number; scanned: number; upserted: number }>(
    "/api/admin/collections/backfill-registry",
    {
      method: "POST",
      headers: adminHeaders(payload?.auth),
      body: JSON.stringify({ fromBlock: payload?.fromBlock })
    },
    0
  );
}

export async function backfillMintTxHashes(payload?: {
  limit?: number;
  auth?: AdminAuth;
}): Promise<{ ok: boolean; scanned: number; resolved: number; unresolved: number; limit: number }> {
  const params = new URLSearchParams();
  if (payload?.limit && Number.isInteger(payload.limit) && payload.limit > 0) {
    params.set("limit", String(payload.limit));
  }
  const query = params.toString();
  return fetchJson<{ ok: boolean; scanned: number; resolved: number; unresolved: number; limit: number }>(
    `/api/admin/tokens/backfill-mint-tx${query ? `?${query}` : ""}`,
    {
      method: "POST",
      headers: adminHeaders(payload?.auth)
    }
  );
}

export async function syncMarketplaceListings(auth?: AdminAuth): Promise<{
  ok: boolean;
  configured: boolean;
  syncInProgress: boolean;
  lastListingSyncAt: string | null;
  lastListingSyncCount: number;
}> {
  return fetchJson<{
    ok: boolean;
    configured: boolean;
    syncInProgress: boolean;
    lastListingSyncAt: string | null;
    lastListingSyncCount: number;
  }>("/api/admin/listings/sync", {
    method: "POST",
    headers: adminHeaders(auth)
  });
}
