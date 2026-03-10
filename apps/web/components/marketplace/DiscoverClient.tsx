"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Address, Hex } from "viem";
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";
import { encodeBuyListing, encodeCreateOffer, toWeiBigInt } from "../../lib/abi";
import { getAppChain } from "../../lib/chains";
import AsyncButton from "../AsyncButton";
import DiscoverFeedCard, {
  type DiscoverFeedRow,
  type DiscoverOfferDraft
} from "./DiscoverFeedCard";
import ListingSummaryRow from "../ListingSummaryRow";
import SectionCardHeader from "../SectionCardHeader";
import SectionStatePanel from "../SectionStatePanel";
import StatusStack from "../StatusStack";
import { getContractsConfig } from "../../lib/contracts";
import {
  errorActionState,
  idleActionState,
  pendingActionState,
  successActionState,
  type ActionState
} from "../../lib/actionState";
import {
  errorLoadState,
  idleLoadState,
  isLoadStateLoading,
  loadingLoadState,
  readyLoadState,
  type LoadState
} from "../../lib/loadState";
import { buildSectionLoadStatusItems } from "../../lib/loadStateSections";
import { getWalletActionError, sendWalletTransactionAndWait } from "../../lib/walletActions";
import { ensureErc20SpendApproval } from "../../lib/marketplaceApprovals";
import { ensureAllowedPaymentToken, requireMarketplaceAddress, resolveMarketplaceAddress } from "../../lib/marketplacePreflight";
import { formatListingPrice, ZERO_ADDRESS } from "../../lib/marketplace";
import {
  fetchActiveListings,
  createModerationReport,
  fetchHiddenListings,
  fetchMintFeed,
  fetchOwnerHoldings,
  type ApiActiveListingItem,
  type ApiMintFeedItem
} from "../../lib/indexerApi";
import { resolveNftMetadataPreview, type NftMetadataPreview } from "../../lib/nftMetadata";
import { formatCollectionIdentity } from "../../lib/nftPresentation";
import {
  getOwnerHoldingPresentation,
  normalizeOwnerHoldingAmountRaw
} from "../../lib/ownerHoldingPresentation";
import { mergeLocalMintFallback } from "../../lib/localMintFallback";
import { toListingViewModel, type ListingViewModel } from "../../lib/listingPresentation";

type SortBy = "newest" | "priceAsc" | "priceDesc";
type SourceFilter = "ALL" | "SHARED" | "CUSTOM";
type StandardFilter = "ALL" | "ERC721" | "ERC1155";
type ListedFilter = "ALL" | "LISTED" | "UNLISTED";
type MediaFilter = "ALL" | "IMAGE" | "AUDIO" | "METADATA";

type MintFeedCache = {
  ts: number;
  items: FeedRow[];
  cursor: number;
  canLoadMore: boolean;
  pageSize: number;
};

type LocalMintFeedCache = {
  items: FeedRow[];
};

type FeedRow = DiscoverFeedRow;

const CACHE_TTL_MS = 60_000;
const FEED_BATCH_SIZE = 50;

function mintFeedCacheKey(chainId: number): string {
  return `nftfactory:mint-feed-cache:v1:${chainId}`;
}

function localMintFeedKey(chainId: number): string {
  return `nftfactory:local-mint-feed:v1:${chainId}`;
}

function readMintFeedCache(chainId: number): MintFeedCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(mintFeedCacheKey(chainId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MintFeedCache;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeMintFeedCache(chainId: number, payload: Omit<MintFeedCache, "ts">): void {
  if (typeof window === "undefined") return;
  const cached: MintFeedCache = { ...payload, ts: Date.now() };
  window.sessionStorage.setItem(mintFeedCacheKey(chainId), JSON.stringify(cached));
}

function readLocalMintFeed(chainId: number): FeedRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(localMintFeedKey(chainId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalMintFeedCache | FeedRow[];
    if (Array.isArray(parsed)) return parsed;
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

function getDraftName(row: FeedRow): string | null {
  return typeof row.draftName === "string" && row.draftName.trim() ? row.draftName.trim() : null;
}

function getDraftDescription(row: FeedRow): string | null {
  return typeof row.draftDescription === "string" && row.draftDescription.trim() ? row.draftDescription.trim() : null;
}

function getMintedAmountRaw(row: FeedRow): string | null {
  return typeof row.mintedAmountRaw === "string" && row.mintedAmountRaw.trim() ? row.mintedAmountRaw.trim() : null;
}

function getHeldAmountRaw(row: FeedRow): string | null {
  return typeof row.heldAmountRaw === "string" && row.heldAmountRaw.trim() ? row.heldAmountRaw.trim() : null;
}

function getReservedAmountRaw(row: FeedRow): string | null {
  return normalizeOwnerHoldingAmountRaw(row.reservedAmountRaw);
}

function getAvailableAmountRaw(row: FeedRow): string | null {
  return normalizeOwnerHoldingAmountRaw(row.availableAmountRaw);
}

function getCurrentOwnerAddresses(row: FeedRow): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  const candidates = Array.isArray(row.currentOwnerAddresses) && row.currentOwnerAddresses.length > 0
    ? row.currentOwnerAddresses
    : [row.currentOwnerAddress || row.ownerAddress];

  for (const value of candidates) {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalizeAddress(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    next.push(normalized);
  }

  return next;
}

function normalizeAddress(value: string): value is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function getListingActionKey(listing: ApiMintFeedItem["activeListing"] | null | undefined): string {
  if (!listing) return "";
  return String(listing.listingRecordId || `${listing.marketplaceVersion || "v2"}:${listing.listingId}`);
}

function mergeFeedRows(current: FeedRow, incoming: FeedRow): FeedRow {
  return {
    ...incoming,
    ...current,
    currentOwnerAddress: current.currentOwnerAddress || incoming.currentOwnerAddress,
    currentOwnerAddresses:
      Array.isArray(current.currentOwnerAddresses) && current.currentOwnerAddresses.length > 0
        ? current.currentOwnerAddresses
        : incoming.currentOwnerAddresses,
    heldAmountRaw: getHeldAmountRaw(current) || getHeldAmountRaw(incoming),
    reservedAmountRaw: getReservedAmountRaw(current) || getReservedAmountRaw(incoming),
    availableAmountRaw: getAvailableAmountRaw(current) || getAvailableAmountRaw(incoming),
    draftName: getDraftName(current) || getDraftName(incoming),
    draftDescription: getDraftDescription(current) || getDraftDescription(incoming),
    mintedAmountRaw: getMintedAmountRaw(current) || getMintedAmountRaw(incoming),
    activeListing: current.activeListing || incoming.activeListing,
    collection: current.collection || incoming.collection
  };
}

type ModerationListing = ListingViewModel;

function toModerationListing(item: ApiActiveListingItem): ModerationListing {
  return toListingViewModel(item);
}

function mergeModerationListings(current: ModerationListing[], incoming: ModerationListing[]): ModerationListing[] {
  const merged = new Map<string, ModerationListing>();
  for (const item of current) {
    merged.set(item.key, item);
  }
  for (const item of incoming) {
    merged.set(item.key, item);
  }
  return [...merged.values()];
}

type DiscoverClientProps = {
  mode?: "feed" | "mod";
};

export default function DiscoverClient({ mode = "feed" }: DiscoverClientProps) {
  const config = useMemo(() => getContractsConfig(), []);
  const appChain = useMemo(() => getAppChain(config.chainId), [config.chainId]);
  const ipfsGateway = useMemo(
    () => (process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs").replace(/\/$/, ""),
    []
  );
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const hiddenRequestIdRef = useRef(0);
  const initialLoadEpochRef = useRef(0);
  const loadMoreRequestIdRef = useRef(0);
  const offerMarketplace = resolveMarketplaceAddress(config, { preferredVersion: "v2" });

  const [allListings, setAllListings] = useState<ModerationListing[]>([]);
  const [feedItems, setFeedItems] = useState<FeedRow[]>([]);
  const [localFeedItems, setLocalFeedItems] = useState<FeedRow[]>([]);
  const [supplementalFeedItems, setSupplementalFeedItems] = useState<FeedRow[]>([]);
  const [feedPreviewIndex, setFeedPreviewIndex] = useState<Record<string, NftMetadataPreview>>({});
  const [feedSearchIndex, setFeedSearchIndex] = useState<Record<string, string>>({});
  const [feedMediaTypeIndex, setFeedMediaTypeIndex] = useState<Record<string, MediaFilter>>({});
  const [hiddenListingRecordIds, setHiddenListingRecordIds] = useState<string[]>([]);
  const [browseLoadState, setBrowseLoadState] = useState<LoadState>(idleLoadState());
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [indexerStatus, setIndexerStatus] = useState("");
  const [actionState, setActionState] = useState<ActionState>(idleActionState());
  const [buyingListingId, setBuyingListingId] = useState("");
  const [submittingOfferRowId, setSubmittingOfferRowId] = useState("");
  const [offerDraft, setOfferDraft] = useState<DiscoverOfferDraft | null>(null);

  const [cursor, setCursor] = useState(0);
  const [canLoadMore, setCanLoadMore] = useState(false);

  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("ALL");
  const [standardFilter, setStandardFilter] = useState<StandardFilter>("ALL");
  const [listedFilter, setListedFilter] = useState<ListedFilter>("ALL");
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("ALL");
  const [searchFilter, setSearchFilter] = useState("");
  const [sellerFilter, setSellerFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("newest");

  const [reporter, setReporter] = useState("");
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("spam");
  const [showFilters, setShowFilters] = useState(false);

  const hasActiveFilters = Boolean(
    sourceFilter !== "ALL" ||
    standardFilter !== "ALL" ||
    listedFilter !== "ALL" ||
    (mode === "feed" && mediaFilter !== "ALL") ||
    searchFilter.trim() ||
    sellerFilter.trim() ||
    sortBy !== "newest"
  );
  const canReport = normalizeAddress(reporter);
  const wrongNetwork = isConnected && chainId !== config.chainId;
  const sharedContractAddresses = useMemo(
    () => new Set([config.shared721.toLowerCase(), config.shared1155.toLowerCase()]),
    [config.shared721, config.shared1155]
  );

  const refreshHidden = useCallback(async () => {
    const requestId = hiddenRequestIdRef.current + 1;
    hiddenRequestIdRef.current = requestId;
    try {
      setIndexerStatus("");
      const hidden = await fetchHiddenListings();
      if (requestId !== hiddenRequestIdRef.current) return;
      setHiddenListingRecordIds(hidden.listingRecordIds || []);
    } catch {
      if (requestId !== hiddenRequestIdRef.current) return;
      setHiddenListingRecordIds([]);
      setIndexerStatus("Indexer moderation state is unavailable, so hidden-list filtering is temporarily disabled.");
    }
  }, []);

  const loadInitial = useCallback(
    async (forceReload = false): Promise<void> => {
      const epoch = initialLoadEpochRef.current + 1;
      initialLoadEpochRef.current = epoch;
      setBrowseLoadState(loadingLoadState());

      try {
        const limit = FEED_BATCH_SIZE;

        if (mode === "feed") {
          if (!forceReload) {
            const cached = readMintFeedCache(config.chainId);
            if (cached && cached.pageSize === limit) {
              if (epoch !== initialLoadEpochRef.current) return;
              setFeedItems(cached.items);
              setCursor(cached.cursor);
              setCanLoadMore(cached.canLoadMore);
              setBrowseLoadState(readyLoadState());
              return;
            }
          }

          const result = await fetchMintFeed(0, limit);
          if (epoch !== initialLoadEpochRef.current) return;
          setFeedItems(result.items);
          setCursor(result.nextCursor);
          setCanLoadMore(result.canLoadMore);
          writeMintFeedCache(config.chainId, {
            items: result.items,
            cursor: result.nextCursor,
            canLoadMore: result.canLoadMore,
            pageSize: limit
          });
          setBrowseLoadState(readyLoadState());
          return;
        }

        const result = await fetchActiveListings(0, limit);
        if (epoch !== initialLoadEpochRef.current) return;
        setAllListings((result.items || []).map(toModerationListing));
        setCursor(result.nextCursor);
        setCanLoadMore(result.canLoadMore);
        setBrowseLoadState(readyLoadState());
      } catch (err) {
        if (epoch !== initialLoadEpochRef.current) return;
        setBrowseLoadState(errorLoadState(err instanceof Error ? err.message : "Could not load listings."));
      } finally {
        if (epoch !== initialLoadEpochRef.current) return;
      }
    },
    [config.chainId, mode]
  );

  const loadMore = useCallback(async (): Promise<void> => {
    if (!canLoadMore) return;
    const epoch = initialLoadEpochRef.current;
    const requestId = loadMoreRequestIdRef.current + 1;
    loadMoreRequestIdRef.current = requestId;
    setIsLoadingMore(true);
    setBrowseLoadState((current) => (current.status === "error" ? idleLoadState() : current));
    try {
      const limit = FEED_BATCH_SIZE;

      if (mode === "feed") {
        const result = await fetchMintFeed(cursor, limit);
        if (epoch !== initialLoadEpochRef.current || requestId !== loadMoreRequestIdRef.current) return;
        const merged = [...feedItems, ...result.items];
        setFeedItems(merged);
        setCursor(result.nextCursor);
        setCanLoadMore(result.canLoadMore);

        writeMintFeedCache(config.chainId, {
          items: merged,
          cursor: result.nextCursor,
          canLoadMore: result.canLoadMore,
          pageSize: limit
        });
        return;
      }

      const result = await fetchActiveListings(cursor, limit);
      if (epoch !== initialLoadEpochRef.current || requestId !== loadMoreRequestIdRef.current) return;
      const merged = mergeModerationListings(allListings, (result.items || []).map(toModerationListing));
      setAllListings(merged);
      setCursor(result.nextCursor);
      setCanLoadMore(result.canLoadMore);
    } catch (err) {
      if (epoch !== initialLoadEpochRef.current || requestId !== loadMoreRequestIdRef.current) return;
      setBrowseLoadState(errorLoadState(err instanceof Error ? err.message : "Could not load more listings."));
    } finally {
      if (epoch !== initialLoadEpochRef.current || requestId !== loadMoreRequestIdRef.current) return;
      setIsLoadingMore(false);
    }
  }, [allListings, canLoadMore, config.chainId, cursor, feedItems, mode]);

  useEffect(() => {
    void loadInitial(false);
  }, [loadInitial]);

  useEffect(() => {
    void refreshHidden();
  }, [refreshHidden]);

  useEffect(() => {
    if (mode !== "feed") return;

    const syncLocalFeed = (): void => {
      setLocalFeedItems(readLocalMintFeed(config.chainId));
    };

    syncLocalFeed();
    window.addEventListener("storage", syncLocalFeed);
    window.addEventListener("focus", syncLocalFeed);
    return () => {
      window.removeEventListener("storage", syncLocalFeed);
      window.removeEventListener("focus", syncLocalFeed);
    };
  }, [config.chainId, mode]);

  useEffect(() => {
    if (mode !== "feed") return;
    if (!address) {
      setSupplementalFeedItems([]);
      return;
    }
    const connectedAddress = address;

    let cancelled = false;

    async function loadSupplementalFeed(): Promise<void> {
      try {
        const deduped = new Map<string, FeedRow>();
        let cursor = 0;
        for (let page = 0; page < 20; page += 1) {
          const result = await fetchOwnerHoldings(connectedAddress, cursor, 100);
          if (cancelled) return;

          for (const item of result.items || []) {
            if (!item.collection) continue;
            const key = `${item.collection.contractAddress.toLowerCase()}:${item.tokenId}`;
            if (!deduped.has(key)) {
              const row: FeedRow = {
                ...item,
                collection: item.collection
              };
              deduped.set(key, row);
            }
          }

          if (!result.canLoadMore) break;
          cursor = result.nextCursor;
        }

        setSupplementalFeedItems([...deduped.values()]);
      } catch {
        if (!cancelled) {
          setSupplementalFeedItems([]);
        }
      }
    }

    void loadSupplementalFeed();
    return () => {
      cancelled = true;
    };
  }, [address, mode]);

  useEffect(() => {
    if (!reporter && address) {
      setReporter(address);
    }
  }, [address, reporter]);

  useEffect(() => {
    if (mode !== "feed") return;
    const node = sentinelRef.current;
    if (!node || !canLoadMore || isLoadingMore || isLoadStateLoading(browseLoadState)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            void loadMore();
          }
        }
      },
      { rootMargin: "300px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [browseLoadState, canLoadMore, isLoadingMore, loadMore, mode]);

  const allFeedItems = useMemo(() => {
    if (mode !== "feed") return feedItems;
    const deduped = new Map<string, FeedRow>();
    for (const item of [...supplementalFeedItems, ...feedItems]) {
      const key = `${item.collection.contractAddress.toLowerCase()}:${item.tokenId}`;
      const existing = deduped.get(key);
      deduped.set(key, existing ? mergeFeedRows(existing, item) : item);
    }
    for (const item of localFeedItems) {
      const key = `${item.collection.contractAddress.toLowerCase()}:${item.tokenId}`;
      const existing = deduped.get(key);
      if (!existing) {
        deduped.set(key, item);
        continue;
      }
      deduped.set(key, {
        ...mergeLocalMintFallback(existing, item),
        collection: {
          ...existing.collection,
          ensSubname: existing.collection.ensSubname || item.collection.ensSubname || null
        }
      });
    }
    return [...deduped.values()];
  }, [feedItems, localFeedItems, mode, supplementalFeedItems]);

  useEffect(() => {
    if (mode !== "feed") return;
    if (allFeedItems.length === 0) {
      setFeedPreviewIndex({});
      setFeedSearchIndex({});
      setFeedMediaTypeIndex({});
      return;
    }

    let cancelled = false;
    const nextPreviews: Record<string, NftMetadataPreview> = {};
    const nextIndex: Record<string, string> = {};
    const nextMediaTypes: Record<string, MediaFilter> = {};

    void Promise.all(
      allFeedItems.map(async (item) => {
        const preview = await resolveNftMetadataPreview({
          metadataUri: item.metadataCid,
          mediaUri: item.mediaCid,
          gateway: ipfsGateway
        });
        nextPreviews[item.id] = preview;
        nextIndex[item.id] = [
          getOwnerHoldingPresentation({
            standard: item.collection.standard,
            tokenId: item.tokenId,
            ensSubname: item.collection.ensSubname,
            draftName: getDraftName(item),
            draftDescription: getDraftDescription(item),
            previewName: preview.name,
            previewDescription: preview.description,
            heldAmountRaw: getHeldAmountRaw(item),
            reservedAmountRaw: getReservedAmountRaw(item),
            availableAmountRaw: getAvailableAmountRaw(item),
            mintedAmountRaw: getMintedAmountRaw(item),
            activeListing: item.activeListing
              ? {
                  listingId: item.activeListing.listingId,
                  paymentToken: item.activeListing.paymentToken,
                  priceRaw: item.activeListing.priceRaw
                }
              : null
          }).title,
          preview.description,
          getDraftDescription(item),
          getOwnerHoldingPresentation({
            standard: item.collection.standard,
            tokenId: item.tokenId,
            ensSubname: item.collection.ensSubname,
            draftName: getDraftName(item),
            draftDescription: getDraftDescription(item),
            previewName: preview.name,
            previewDescription: preview.description,
            heldAmountRaw: getHeldAmountRaw(item),
            reservedAmountRaw: getReservedAmountRaw(item),
            availableAmountRaw: getAvailableAmountRaw(item),
            mintedAmountRaw: getMintedAmountRaw(item),
            activeListing: item.activeListing
              ? {
                  listingId: item.activeListing.listingId,
                  paymentToken: item.activeListing.paymentToken,
                  priceRaw: item.activeListing.priceRaw
                }
              : null
          }).collectionIdentity
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        nextMediaTypes[item.id] = preview.imageUrl ? "IMAGE" : preview.audioUrl ? "AUDIO" : "METADATA";
      })
    ).then(() => {
      if (!cancelled) {
        setFeedPreviewIndex(nextPreviews);
        setFeedSearchIndex(nextIndex);
        setFeedMediaTypeIndex(nextMediaTypes);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [allFeedItems, ipfsGateway, mode]);

  const filtered = useMemo(() => {
    if (mode === "feed") {
      const normalizedSearchFilter = searchFilter.trim().toLowerCase();
      const normalizedSellerFilter = sellerFilter.trim().toLowerCase();

      let rows = [...allFeedItems];

      if (sourceFilter !== "ALL") {
        rows = rows.filter((row) => {
          const isShared = sharedContractAddresses.has(row.collection.contractAddress.toLowerCase());
          return sourceFilter === "SHARED" ? isShared : !isShared;
        });
      }

      if (standardFilter !== "ALL") {
        rows = rows.filter((row) => row.collection.standard.toUpperCase() === standardFilter);
      }

      if (listedFilter !== "ALL") {
        rows = rows.filter((row) => (listedFilter === "LISTED" ? Boolean(row.activeListing) : !row.activeListing));
      }

      if (mediaFilter !== "ALL") {
        rows = rows.filter((row) => (feedMediaTypeIndex[row.id] || "METADATA") === mediaFilter);
      }

      if (normalizedSearchFilter) {
        rows = rows.filter((row) => {
          const collectionLabel = formatCollectionIdentity(row.collection.ensSubname) || "";
          const searchable = [
            row.collection.contractAddress,
            row.collection.standard,
            sharedContractAddresses.has(row.collection.contractAddress.toLowerCase()) ? "shared" : "custom",
            row.tokenId,
            row.metadataCid,
            row.mediaCid || "",
            collectionLabel,
            feedSearchIndex[row.id] || ""
          ]
            .join(" ")
            .toLowerCase();
          return searchable.includes(normalizedSearchFilter);
        });
      }

      if (normalizeAddress(normalizedSellerFilter)) {
        rows = rows.filter(
          (row) =>
            row.ownerAddress.toLowerCase() === normalizedSellerFilter ||
            getCurrentOwnerAddresses(row).includes(normalizedSellerFilter) ||
            row.creatorAddress.toLowerCase() === normalizedSellerFilter
        );
      } else if (normalizedSellerFilter) {
        rows = rows.filter(
          (row) =>
            row.ownerAddress.toLowerCase().includes(normalizedSellerFilter) ||
            getCurrentOwnerAddresses(row).some((ownerAddress) => ownerAddress.includes(normalizedSellerFilter)) ||
            row.creatorAddress.toLowerCase().includes(normalizedSellerFilter)
        );
      }

      const sorted = [...rows];
      if (sortBy === "priceAsc") {
        sorted.sort((a, b) => {
          const aPrice = a.activeListing ? BigInt(a.activeListing.priceRaw) : null;
          const bPrice = b.activeListing ? BigInt(b.activeListing.priceRaw) : null;
          if (aPrice === null && bPrice === null) return 0;
          if (aPrice === null) return 1;
          if (bPrice === null) return -1;
          return aPrice === bPrice ? 0 : aPrice < bPrice ? -1 : 1;
        });
      } else if (sortBy === "priceDesc") {
        sorted.sort((a, b) => {
          const aPrice = a.activeListing ? BigInt(a.activeListing.priceRaw) : null;
          const bPrice = b.activeListing ? BigInt(b.activeListing.priceRaw) : null;
          if (aPrice === null && bPrice === null) return 0;
          if (aPrice === null) return 1;
          if (bPrice === null) return -1;
          return aPrice === bPrice ? 0 : aPrice > bPrice ? -1 : 1;
        });
      } else {
        sorted.sort((a, b) => {
          const aTime = new Date(a.mintedAt).getTime();
          const bTime = new Date(b.mintedAt).getTime();
          if (aTime === bTime) return b.id.localeCompare(a.id);
          return bTime - aTime;
        });
      }

      return sorted;
    }

    const shared721 = config.shared721.toLowerCase();
    const shared1155 = config.shared1155.toLowerCase();
    const normalizedSearchFilter = searchFilter.trim().toLowerCase();
    const normalizedSellerFilter = sellerFilter.trim().toLowerCase();
    const hiddenSet = new Set(hiddenListingRecordIds);

    let rows = allListings.filter((row) => !hiddenSet.has(row.key));

    if (sourceFilter !== "ALL") {
      rows = rows.filter((row) => {
        const isShared = row.nft.toLowerCase() === shared721 || row.nft.toLowerCase() === shared1155;
        return sourceFilter === "SHARED" ? isShared : !isShared;
      });
    }

    if (standardFilter !== "ALL") {
      rows = rows.filter((row) => row.standard === standardFilter);
    }

    if (listedFilter !== "ALL") {
      rows = rows.filter((row) => (listedFilter === "LISTED" ? row.active : !row.active));
    }

    if (normalizedSearchFilter) {
      rows = rows.filter((row) =>
        [row.nft, row.standard, row.tokenId.toString(), row.seller].join(" ").toLowerCase().includes(normalizedSearchFilter)
      );
    }

    if (normalizeAddress(normalizedSellerFilter)) {
      rows = rows.filter((row) => row.seller.toLowerCase() === normalizedSellerFilter);
    } else if (normalizedSellerFilter) {
      rows = rows.filter((row) => row.seller.toLowerCase().includes(normalizedSellerFilter));
    }

    const sorted = [...rows];
    if (sortBy === "priceAsc") {
      sorted.sort((a, b) => (a.price === b.price ? 0 : a.price < b.price ? -1 : 1));
    } else if (sortBy === "priceDesc") {
      sorted.sort((a, b) => (a.price === b.price ? 0 : a.price > b.price ? -1 : 1));
    } else {
      sorted.sort((a, b) => (a.id === b.id ? b.key.localeCompare(a.key) : b.id - a.id));
    }
    return sorted;
  }, [
    allListings,
    sourceFilter,
    standardFilter,
    listedFilter,
    mediaFilter,
    searchFilter,
    sellerFilter,
    sortBy,
    hiddenListingRecordIds,
    mode,
    allFeedItems,
    feedMediaTypeIndex,
    feedSearchIndex,
    sharedContractAddresses
  ]);

  async function submitReport(listing: ModerationListing): Promise<void> {
    if (!normalizeAddress(reporter)) {
      setActionState(errorActionState("Enter a valid reporter wallet address before submitting a report."));
      return;
    }
    try {
      setActionState(pendingActionState(`Submitting ${reportReason} report...`));
      await createModerationReport({
        listingId: listing.id,
        listingRecordId: listing.key,
        marketplaceVersion: listing.marketplaceVersion || undefined,
        collectionAddress: listing.nft,
        tokenId: listing.tokenId.toString(),
        sellerAddress: listing.seller,
        standard: listing.standard,
        reporterAddress: reporter.toLowerCase(),
        reason: reportReason
      });
      setReportingId(null);
      setReportReason("spam");
      setActionState(successActionState("Report submitted."));
      await refreshHidden();
    } catch (err) {
      setActionState(errorActionState(err instanceof Error ? err.message : "Failed to submit report."));
    }
  }

  function clearListingFromFeed(contractAddress: string, tokenId: string, nextOwnerAddress: string): void {
    const normalizeRows = (rows: FeedRow[]) =>
      rows.map((item) => {
        const sameContract = item.collection.contractAddress.toLowerCase() === contractAddress.toLowerCase();
        const sameToken = item.tokenId === tokenId;
        if (!sameContract || !sameToken) return item;
        return {
          ...item,
          ownerAddress: nextOwnerAddress.toLowerCase(),
          activeListing: null
        };
      });

    setFeedItems((current) => normalizeRows(current));
    setLocalFeedItems((current) => normalizeRows(current));
    setSupplementalFeedItems((current) => normalizeRows(current));
  }

  async function buyNow(row: FeedRow): Promise<void> {
    if (!row.activeListing) {
      setActionState(errorActionState("This NFT does not have an active listing right now."));
      return;
    }
    const readyWalletClient = walletClient;
    const readyPublicClient = publicClient;
    const walletActionError = getWalletActionError({
      walletClient: readyWalletClient,
      publicClient: readyPublicClient,
      wrongNetwork,
      disconnectedMessage: "Connect a wallet first.",
      wrongNetworkMessage: `Switch to ${appChain.name} before buying.`
    });
    if (walletActionError || !readyWalletClient?.account || !readyPublicClient) {
      setActionState(errorActionState(walletActionError || "Connect a wallet first."));
      return;
    }
    if (row.activeListing.sellerAddress.toLowerCase() === readyWalletClient.account.address.toLowerCase()) {
      setActionState(errorActionState("You cannot buy your own listing."));
      return;
    }

    try {
      const listingActionKey = getListingActionKey(row.activeListing);
      setBuyingListingId(listingActionKey);
      setActionState(pendingActionState(`Buying listing #${row.activeListing.listingId}...`));

      const paymentToken = row.activeListing.paymentToken as `0x${string}`;
      const listingMarketplace = requireMarketplaceAddress(config, {
        preferredVersion: "v2",
        missingMessage: "Marketplace V2 is not configured in this app build."
      });
      await ensureErc20SpendApproval({
        walletClient: readyWalletClient,
        publicClient: readyPublicClient,
        tokenAddress: paymentToken,
        spender: listingMarketplace,
        requiredAmount: BigInt(row.activeListing.priceRaw),
        zeroAddress: ZERO_ADDRESS as `0x${string}`
      });

      const buyHash = await sendWalletTransactionAndWait({
        walletClient: readyWalletClient,
        publicClient: readyPublicClient,
        to: listingMarketplace,
        data: encodeBuyListing(BigInt(row.activeListing.listingId)) as Hex,
        value: paymentToken.toLowerCase() === ZERO_ADDRESS.toLowerCase() ? BigInt(row.activeListing.priceRaw) : 0n
      });

      clearListingFromFeed(row.collection.contractAddress, row.tokenId, readyWalletClient.account.address);
      setActionState(successActionState(`Bought ${row.collection.standard} token #${row.tokenId} from listing #${row.activeListing.listingId}.`));
      void loadInitial(true);
    } catch (err) {
      setActionState(errorActionState(err instanceof Error ? err.message : "Failed to buy this listing."));
    } finally {
      setBuyingListingId("");
    }
  }

  function openOfferComposer(row: FeedRow): void {
    if (!offerMarketplace) {
      setActionState(errorActionState("Make offer needs `NEXT_PUBLIC_MARKETPLACE_V2_ADDRESS` before wallet-to-wallet offers can be submitted."));
      return;
    }

    const defaultPaymentToken = row.activeListing?.paymentToken?.toLowerCase() === ZERO_ADDRESS.toLowerCase() || !row.activeListing?.paymentToken
      ? "ETH"
      : "ERC20";
    setActionState(idleActionState());
    setOfferDraft({
      rowId: row.id,
      paymentTokenType: defaultPaymentToken,
      erc20Address: defaultPaymentToken === "ERC20" ? row.activeListing?.paymentToken || "" : "",
      priceInput: "",
      durationDays: "7",
      quantity: row.collection.standard.toUpperCase() === "ERC1155" ? "1" : "1"
    });
  }

  function closeOfferComposer(): void {
    setOfferDraft(null);
  }

  async function submitOffer(row: FeedRow): Promise<void> {
    if (!offerDraft || offerDraft.rowId !== row.id) {
      setActionState(errorActionState("Open the offer form first."));
      return;
    }
    const readyWalletClient = walletClient;
    const readyPublicClient = publicClient;
    const walletActionError = getWalletActionError({
      walletClient: readyWalletClient,
      publicClient: readyPublicClient,
      wrongNetwork,
      disconnectedMessage: "Connect a wallet first.",
      wrongNetworkMessage: `Switch to ${appChain.name} before making an offer.`
    });
    if (walletActionError || !readyWalletClient?.account || !readyPublicClient) {
      setActionState(errorActionState(walletActionError || "Connect a wallet first."));
      return;
    }

    try {
      const readyOfferMarketplace = requireMarketplaceAddress(config, {
        preferredVersion: "v2",
        missingMessage: "Marketplace V2 address is not configured."
      });
      const isErc1155 = row.collection.standard.toUpperCase() === "ERC1155";
      const quantity = isErc1155 ? BigInt(offerDraft.quantity.trim() || "0") : 1n;
      if (quantity <= 0n) {
        throw new Error("Offer quantity must be at least 1.");
      }
      const durationDays = BigInt(offerDraft.durationDays.trim() || "0");
      if (durationDays <= 0n) {
        throw new Error("Offer duration must be at least 1 day.");
      }

      const paymentToken =
        offerDraft.paymentTokenType === "ETH"
          ? (ZERO_ADDRESS as `0x${string}`)
          : (offerDraft.erc20Address.trim() as `0x${string}`);
      if (offerDraft.paymentTokenType === "ERC20" && !normalizeAddress(paymentToken)) {
        throw new Error("Enter a valid ERC20 payment token address.");
      }

      const price =
        offerDraft.paymentTokenType === "ETH"
          ? toWeiBigInt(offerDraft.priceInput)
          : BigInt(offerDraft.priceInput.trim() || "0");
      if (price <= 0n) {
        throw new Error("Offer price must be greater than zero.");
      }

      await ensureAllowedPaymentToken({
        publicClient: readyPublicClient,
        registry: config.registry as Address,
        paymentToken
      });

      setSubmittingOfferRowId(row.id);
      setActionState(pendingActionState(`Submitting offer for token #${row.tokenId}...`));

      await ensureErc20SpendApproval({
        walletClient: readyWalletClient,
        publicClient: readyPublicClient,
        tokenAddress: paymentToken,
        spender: readyOfferMarketplace,
        requiredAmount: price,
        zeroAddress: ZERO_ADDRESS as `0x${string}`
      });

      await sendWalletTransactionAndWait({
        walletClient: readyWalletClient,
        publicClient: readyPublicClient,
        to: readyOfferMarketplace,
        data: encodeCreateOffer(
          row.collection.contractAddress as `0x${string}`,
          BigInt(row.tokenId),
          quantity,
          row.collection.standard.toUpperCase() === "ERC1155" ? "ERC1155" : "ERC721",
          paymentToken,
          price,
          durationDays
        ) as Hex,
        value: paymentToken.toLowerCase() === ZERO_ADDRESS.toLowerCase() ? price : 0n
      });

      setActionState(successActionState(`Offer submitted for ${row.collection.standard} token #${row.tokenId}.`));
      closeOfferComposer();
    } catch (err) {
      setActionState(errorActionState(err instanceof Error ? err.message : "Failed to submit offer."));
    } finally {
      setSubmittingOfferRowId((current) => (current === row.id ? "" : current));
    }
  }

  function resetFilters(): void {
    setSourceFilter("ALL");
    setStandardFilter("ALL");
    setListedFilter("ALL");
    setMediaFilter("ALL");
    setSearchFilter("");
    setSellerFilter("");
    setSortBy("newest");
  }

  return (
    <section className="wizard">
      <div className="card formCard">
        <SectionCardHeader
          title={mode === "feed" ? "Mint Feed" : "Moderation Feed"}
          description={
            mode === "feed"
              ? "Continuous public feed of minted NFTs from NFTFactory shared contracts and creator collections. The newest mints appear first, and older items load as you keep scrolling."
              : "Moderation-focused view of the same live listing stream. Keep filters tight, validate context, and report from here before moving to admin actions."
          }
          actions={
            <>
              <button type="button" onClick={() => setShowFilters((value) => !value)}>
                Filters
              </button>
              <AsyncButton
                idleLabel="Refresh"
                loadingLabel="Loading..."
                loading={isLoadStateLoading(browseLoadState)}
                onClick={() => {
                  void loadInitial(true);
                }}
              />
              {mode === "mod" && canLoadMore ? (
                <AsyncButton
                  idleLabel="Load More"
                  loadingLabel="Loading more..."
                  loading={isLoadingMore}
                  onClick={() => {
                    void loadMore();
                  }}
                />
              ) : null}
            </>
          }
        />

        {showFilters ? (
          <>
            <div className="gridMini">
              <label>
                Source
                <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}>
                  <option value="ALL">All mints</option>
                  <option value="SHARED">Shared mints only</option>
                  <option value="CUSTOM">Creator collections only</option>
                </select>
              </label>

              <label>
                Standard
                <select value={standardFilter} onChange={(e) => setStandardFilter(e.target.value as StandardFilter)}>
                  <option value="ALL">All standards</option>
                  <option value="ERC721">ERC-721</option>
                  <option value="ERC1155">ERC-1155</option>
                </select>
              </label>

              <label>
                Listing
                <select value={listedFilter} onChange={(e) => setListedFilter(e.target.value as ListedFilter)}>
                  <option value="ALL">Listed and unlisted</option>
                  <option value="LISTED">Listed only</option>
                  <option value="UNLISTED">Unlisted only</option>
                </select>
              </label>

              {mode === "feed" ? (
                <label>
                  Media
                  <select value={mediaFilter} onChange={(e) => setMediaFilter(e.target.value as MediaFilter)}>
                    <option value="ALL">All media</option>
                    <option value="IMAGE">Image</option>
                    <option value="AUDIO">Audio</option>
                    <option value="METADATA">Metadata only</option>
                  </select>
                </label>
              ) : null}

              <label>
                Search
                <input value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)} />
              </label>

              <label>
                Seller wallet
                <input value={sellerFilter} onChange={(e) => setSellerFilter(e.target.value)} />
              </label>

              <label>
                Sort
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
                  <option value="newest">Newest first</option>
                  <option value="priceAsc">Price low to high</option>
                  <option value="priceDesc">Price high to low</option>
                </select>
              </label>

            </div>

            {mode === "mod" ? (
              <>
                <div className="row">
                  <label>
                    Reporter address
                    <input value={reporter} onChange={(e) => setReporter(e.target.value)} />
                  </label>
                </div>
                {!reporter && !address ? <p className="hint">Connect wallet or enter reporter address manually.</p> : null}
                {reporter && !canReport ? <p className="hint">Reporter address must be a valid wallet before a report can be submitted.</p> : null}
              </>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="card">
        <p className="hint">
          {mode === "feed"
            ? `Showing ${filtered.length} minted NFT(s), newest first.`
            : `Showing ${filtered.length} listing(s). Hidden by moderation: ${hiddenListingRecordIds.length}.`}
        </p>
        <StatusStack
          items={buildSectionLoadStatusItems({
            keyPrefix: "browse",
            actionState,
            actionFirst: true,
            loadState: browseLoadState,
            loadingMessage: mode === "feed" ? "Loading minted feed..." : "Loading indexed listings...",
            hintMessage: indexerStatus
          })}
        />
        {hasActiveFilters && filtered.length > 0 ? (
          <div className="row">
            <p className="hint">Filters are active. Clear them if you expected a broader feed.</p>
            <button type="button" className="miniBtn" onClick={resetFilters}>
              Clear Filters
            </button>
          </div>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <SectionStatePanel
          className="card formCard"
          title={mode === "feed" ? "No Mints Match This View" : "No Listings Match This View"}
          message={
            hasActiveFilters
              ? "No items match the current filters. Clear them or refresh this view to broaden the results."
              : mode === "feed"
                ? "No minted NFTs are available in this view yet."
                : "No indexed listings are available in this view yet."
          }
          actions={
            <>
              {hasActiveFilters ? (
                <button type="button" className="miniBtn" onClick={resetFilters}>
                  Clear Filters
                </button>
              ) : null}
              <AsyncButton
                idleLabel="Refresh"
                loadingLabel="Loading..."
                loading={isLoadStateLoading(browseLoadState)}
                onClick={() => {
                  void loadInitial(true);
                }}
              />
            </>
          }
        />
      ) : null}

      <div className="listTable">
        {mode === "feed"
          ? (filtered as FeedRow[]).map((row) => (
              <DiscoverFeedCard
                key={row.id}
                row={row}
                chainName={getAppChain(row.collection.chainId).name}
                chainId={row.collection.chainId}
                ipfsGateway={ipfsGateway}
                address={address}
                isConnected={isConnected}
                wrongNetwork={wrongNetwork}
                sharedContractAddresses={sharedContractAddresses}
                preview={feedPreviewIndex[row.id]}
                offerDraft={offerDraft}
                buyingListingId={buyingListingId}
                submittingOfferRowId={submittingOfferRowId}
                onBuyNow={buyNow}
                onOpenOfferComposer={openOfferComposer}
                onCloseOfferComposer={closeOfferComposer}
                onSubmitOffer={submitOffer}
                setOfferDraft={setOfferDraft}
              />
            ))
          : (filtered as ModerationListing[]).map((row) => (
              <ListingSummaryRow
                key={row.key}
                item={row}
                chainId={config.chainId}
                ipfsGateway={ipfsGateway}
                className="listRow"
                actions={
                  reportingId === row.key ? (
                    <div className="reportInline">
                      <select
                        value={reportReason}
                        onChange={(e) => setReportReason(e.target.value)}
                      >
                        <option value="spam">Spam</option>
                        <option value="abuse">Abuse</option>
                        <option value="scam">Scam</option>
                        <option value="other">Other</option>
                      </select>
                      <button type="button" className="miniBtn" disabled={!canReport} onClick={() => void submitReport(row)}>
                        Submit
                      </button>
                      <button type="button" className="miniBtn" onClick={() => setReportingId(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="miniBtn" onClick={() => setReportingId(row.key)}>
                      Report
                    </button>
                  )
                }
              />
            ))}
      </div>
      <div ref={sentinelRef} className="card">
        <p className="hint">
          {canLoadMore
            ? mode === "feed"
              ? isLoadingMore
                ? "Loading more mints..."
                : "Keep scrolling to load more mints."
              : "Use Load More to continue reviewing the moderation feed."
            : "End of feed"}
        </p>
      </div>
    </section>
  );
}
