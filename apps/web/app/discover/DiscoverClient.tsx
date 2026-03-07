"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Address, Hex } from "viem";
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";
import { encodeBuyListing, encodeCreateOffer, encodeErc20Approve, toWeiBigInt } from "../../lib/abi";
import { getAppChain, getExplorerBaseUrl } from "../../lib/chains";
import ListingSummaryRow from "../../components/ListingSummaryRow";
import { getContractsConfig } from "../../lib/contracts";
import {
  formatListingPrice,
  toExplorerAddress,
  truncateAddress,
  ZERO_ADDRESS
} from "../../lib/marketplace";
import { buildBuyPlan } from "../../lib/marketplaceBuy";
import {
  fetchActiveListings,
  createModerationReport,
  fetchHiddenListings,
  fetchMintFeed,
  fetchOwnerHoldings,
  type ApiActiveListingItem,
  type ApiMintFeedItem
} from "../../lib/indexerApi";
import {
  ipfsToGatewayUrl,
  looksLikeAudioUrl,
  looksLikeImageUrl,
  resolveNftMetadataPreview,
  type NftMetadataPreview
} from "../../lib/nftMetadata";
import {
  formatCollectionIdentity,
  getMintAmountLabel,
  getMintSourceLabel,
} from "../../lib/nftPresentation";
import {
  getOwnerHoldingPresentation,
  normalizeOwnerHoldingAmountRaw
} from "../../lib/ownerHoldingPresentation";
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

type FeedRow = ApiMintFeedItem & {
  draftName?: string | null;
  draftDescription?: string | null;
  mintedAmountRaw?: string | null;
};

const ERC20_ALLOWANCE_ABI = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    outputs: [{ name: "", type: "uint256" }]
  }
] as const;

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

function parsePositiveQuantityRaw(value: string | null | undefined): bigint | null {
  const normalized = String(value || "").trim();
  if (!/^[1-9][0-9]*$/.test(normalized)) return null;
  try {
    return BigInt(normalized);
  } catch {
    return null;
  }
}

function normalizeAddress(value: string): value is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function getListingActionKey(listing: ApiMintFeedItem["activeListing"] | null | undefined): string {
  if (!listing) return "";
  return String(listing.listingRecordId || `${listing.marketplaceVersion || "v1"}:${listing.listingId}`);
}

function mergeFeedRows(current: FeedRow, incoming: FeedRow): FeedRow {
  return {
    ...incoming,
    ...current,
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

function FeedCardMedia({
  preview,
  metadataLink,
  mediaLink,
  title
}: {
  preview: NftMetadataPreview | null;
  metadataLink: string | null;
  mediaLink: string | null;
  title: string;
}) {
  if (preview?.imageUrl) {
    return (
      <div className="feedCardMedia">
        <img src={preview.imageUrl} alt={title} className="feedCardImage" loading="lazy" />
      </div>
    );
  }

  if (preview?.audioUrl) {
    return (
      <div className="feedCardMedia feedCardMediaFallback">
        <div className="feedCardFallbackCopy">
          <span className="feedCardFallbackLabel">Audio drop</span>
          <strong>{title}</strong>
        </div>
        <audio controls src={preview.audioUrl} className="feedCardAudio">
          Your browser does not support audio playback.
        </audio>
      </div>
    );
  }

  if (metadataLink || mediaLink) {
    return (
      <div className="feedCardMedia feedCardMediaFallback">
        <div className="feedCardFallbackCopy">
          <span className="feedCardFallbackLabel">Media live</span>
          <strong>{title}</strong>
          <p>Metadata is available, but this mint does not expose a display image.</p>
        </div>
      </div>
    );
  }

  return null;
}

function toExplorerTx(chainId: number, hash: string | null | undefined): string | null {
  if (!hash) return null;
  const baseUrl = getExplorerBaseUrl(chainId);
  return baseUrl ? `${baseUrl}/tx/${hash}` : null;
}

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
  const offerMarketplace = (config.marketplaceV2 || null) as Address | null;

  const [allListings, setAllListings] = useState<ModerationListing[]>([]);
  const [feedItems, setFeedItems] = useState<FeedRow[]>([]);
  const [localFeedItems, setLocalFeedItems] = useState<FeedRow[]>([]);
  const [supplementalFeedItems, setSupplementalFeedItems] = useState<FeedRow[]>([]);
  const [feedPreviewIndex, setFeedPreviewIndex] = useState<Record<string, NftMetadataPreview>>({});
  const [feedSearchIndex, setFeedSearchIndex] = useState<Record<string, string>>({});
  const [feedMediaTypeIndex, setFeedMediaTypeIndex] = useState<Record<string, MediaFilter>>({});
  const [hiddenListingRecordIds, setHiddenListingRecordIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [indexerStatus, setIndexerStatus] = useState("");
  const [tradeMessage, setTradeMessage] = useState("");
  const [buyingListingId, setBuyingListingId] = useState("");
  const [submittingOfferRowId, setSubmittingOfferRowId] = useState("");
  const [offerDraft, setOfferDraft] = useState<{
    rowId: string;
    paymentTokenType: "ETH" | "ERC20";
    erc20Address: string;
    priceInput: string;
    durationDays: string;
    quantity: string;
  } | null>(null);

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
    try {
      setIndexerStatus("");
      const hidden = await fetchHiddenListings();
      setHiddenListingRecordIds(hidden.listingRecordIds || []);
    } catch {
      setHiddenListingRecordIds([]);
      setIndexerStatus("Indexer moderation state is unavailable, so hidden-list filtering is temporarily disabled.");
    }
  }, []);

  const loadInitial = useCallback(
    async (forceReload = false): Promise<void> => {
      setIsLoading(true);
      setError("");

      try {
        const limit = FEED_BATCH_SIZE;

        if (mode === "feed") {
          if (!forceReload) {
            const cached = readMintFeedCache(config.chainId);
            if (cached && cached.pageSize === limit) {
              setFeedItems(cached.items);
              setCursor(cached.cursor);
              setCanLoadMore(cached.canLoadMore);
              return;
            }
          }

          const result = await fetchMintFeed(0, limit);
          setFeedItems(result.items);
          setCursor(result.nextCursor);
          setCanLoadMore(result.canLoadMore);
          writeMintFeedCache(config.chainId, {
            items: result.items,
            cursor: result.nextCursor,
            canLoadMore: result.canLoadMore,
            pageSize: limit
          });
          return;
        }

        const result = await fetchActiveListings(0, limit, undefined, { includeAllMarkets: true });
        setAllListings((result.items || []).map(toModerationListing));
        setCursor(result.nextCursor);
        setCanLoadMore(result.canLoadMore);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load listings.");
      } finally {
        setIsLoading(false);
      }
    },
    [config.chainId, mode]
  );

  const loadMore = useCallback(async (): Promise<void> => {
    if (!canLoadMore) return;
    setIsLoadingMore(true);
    setError("");
    try {
      const limit = FEED_BATCH_SIZE;

      if (mode === "feed") {
        const result = await fetchMintFeed(cursor, limit);
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

      const result = await fetchActiveListings(cursor, limit, undefined, { includeAllMarkets: true });
      const merged = mergeModerationListings(allListings, (result.items || []).map(toModerationListing));
      setAllListings(merged);
      setCursor(result.nextCursor);
      setCanLoadMore(result.canLoadMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load more listings.");
    } finally {
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
    if (!node || !canLoadMore || isLoadingMore || isLoading) return;

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
  }, [canLoadMore, isLoading, isLoadingMore, loadMore, mode]);

  const allFeedItems = useMemo(() => {
    if (mode !== "feed") return feedItems;
    const merged = [...localFeedItems, ...supplementalFeedItems, ...feedItems];
    const deduped = new Map<string, FeedRow>();
    for (const item of merged) {
      const key = `${item.collection.contractAddress.toLowerCase()}:${item.tokenId}`;
      const existing = deduped.get(key);
      deduped.set(key, existing ? mergeFeedRows(existing, item) : item);
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
            row.creatorAddress.toLowerCase() === normalizedSellerFilter
        );
      } else if (normalizedSellerFilter) {
        rows = rows.filter(
          (row) =>
            row.ownerAddress.toLowerCase().includes(normalizedSellerFilter) ||
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
      setError("Enter a valid reporter wallet address before submitting a report.");
      return;
    }
    try {
      setError("");
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
      await refreshHidden();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit report.");
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
      setError("This NFT does not have an active listing right now.");
      return;
    }
    if (!walletClient?.account || !publicClient) {
      setError("Connect a wallet first.");
      return;
    }
    if (wrongNetwork) {
      setError(`Switch to ${appChain.name} before buying.`);
      return;
    }
    if (row.activeListing.sellerAddress.toLowerCase() === walletClient.account.address.toLowerCase()) {
      setError("You cannot buy your own listing.");
      return;
    }

    try {
      setError("");
      setTradeMessage("");
      const listingActionKey = getListingActionKey(row.activeListing);
      setBuyingListingId(listingActionKey);

      const paymentToken = row.activeListing.paymentToken as `0x${string}`;
      const listingMarketplace =
        (row.activeListing.marketplaceVersion || "v1").toLowerCase() === "v2"
          ? ((config.marketplaceV2 || "") as Address)
          : (config.marketplace as Address);
      if (!listingMarketplace) {
        throw new Error("Listing market is not configured in this app build.");
      }
      let allowance: bigint | null = null;
      if (paymentToken.toLowerCase() !== ZERO_ADDRESS.toLowerCase()) {
        allowance = (await publicClient.readContract({
          address: paymentToken,
          abi: ERC20_ALLOWANCE_ABI,
          functionName: "allowance",
          args: [walletClient.account.address, listingMarketplace]
        })) as bigint;
      }

      const plan = buildBuyPlan({
        paymentToken,
        zeroAddress: ZERO_ADDRESS as `0x${string}`,
        price: BigInt(row.activeListing.priceRaw),
        allowance
      });

      for (const approvalAmount of plan.approvalAmounts) {
        const approvalHash = await walletClient.sendTransaction({
          account: walletClient.account,
          to: paymentToken,
          data: encodeErc20Approve(listingMarketplace as `0x${string}`, approvalAmount) as Hex
        });
        await publicClient.waitForTransactionReceipt({ hash: approvalHash });
      }

      const buyHash = await walletClient.sendTransaction({
        account: walletClient.account,
        to: listingMarketplace,
        data: encodeBuyListing(BigInt(row.activeListing.listingId)) as Hex,
        value: plan.txValue
      });
      await publicClient.waitForTransactionReceipt({ hash: buyHash });

      clearListingFromFeed(row.collection.contractAddress, row.tokenId, walletClient.account.address);
      setTradeMessage(`Bought ${row.collection.standard} token #${row.tokenId} from listing #${row.activeListing.listingId}.`);
      void loadInitial(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to buy this listing.");
    } finally {
      setBuyingListingId("");
    }
  }

  function openOfferComposer(row: FeedRow): void {
    if (!offerMarketplace) {
      setTradeMessage("Make offer needs `NEXT_PUBLIC_MARKETPLACE_V2_ADDRESS` before wallet-to-wallet offers can be submitted.");
      return;
    }

    const defaultPaymentToken = row.activeListing?.paymentToken?.toLowerCase() === ZERO_ADDRESS.toLowerCase() || !row.activeListing?.paymentToken
      ? "ETH"
      : "ERC20";
    setTradeMessage("");
    setError("");
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
      setError("Open the offer form first.");
      return;
    }
    if (!offerMarketplace) {
      setError("Marketplace V2 address is not configured.");
      return;
    }
    if (!walletClient?.account || !publicClient) {
      setError("Connect a wallet first.");
      return;
    }
    if (wrongNetwork) {
      setError(`Switch to ${appChain.name} before making an offer.`);
      return;
    }

    try {
      const isErc1155 = row.collection.standard.toUpperCase() === "ERC1155";
      const quantity = isErc1155 ? BigInt(offerDraft.quantity.trim() || "0") : 1n;
      if (quantity <= 0n) {
        throw new Error("Offer quantity must be at least 1.");
      }
      const indexedHeldAmount = isErc1155 ? parsePositiveQuantityRaw(getHeldAmountRaw(row)) : null;
      if (isErc1155 && indexedHeldAmount !== null && quantity > indexedHeldAmount) {
        throw new Error(`Offer quantity exceeds the indexed holder balance. Available: ${indexedHeldAmount.toString()}.`);
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

      setError("");
      setTradeMessage("");
      setSubmittingOfferRowId(row.id);

      let allowance: bigint | null = null;
      if (paymentToken.toLowerCase() !== ZERO_ADDRESS.toLowerCase()) {
        allowance = (await publicClient.readContract({
          address: paymentToken,
          abi: ERC20_ALLOWANCE_ABI,
          functionName: "allowance",
          args: [walletClient.account.address, offerMarketplace]
        })) as bigint;
      }

      const plan = buildBuyPlan({
        paymentToken,
        zeroAddress: ZERO_ADDRESS as `0x${string}`,
        price,
        allowance
      });

      for (const approvalAmount of plan.approvalAmounts) {
        const approvalHash = await walletClient.sendTransaction({
          account: walletClient.account,
          to: paymentToken,
          data: encodeErc20Approve(offerMarketplace, approvalAmount) as Hex
        });
        await publicClient.waitForTransactionReceipt({ hash: approvalHash });
      }

      const offerHash = await walletClient.sendTransaction({
        account: walletClient.account,
        to: offerMarketplace,
        data: encodeCreateOffer(
          row.collection.contractAddress as `0x${string}`,
          BigInt(row.tokenId),
          quantity,
          row.collection.standard.toUpperCase() === "ERC1155" ? "ERC1155" : "ERC721",
          paymentToken,
          price,
          durationDays
        ) as Hex,
        value: plan.txValue
      });
      await publicClient.waitForTransactionReceipt({ hash: offerHash });

      setTradeMessage(`Offer submitted for ${row.collection.standard} token #${row.tokenId}.`);
      closeOfferComposer();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit offer.");
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
        <h3>{mode === "feed" ? "Mint Feed" : "Moderation Feed"}</h3>
        <p className="hint">
          {mode === "feed"
            ? "Continuous public feed of minted NFTs from NFTFactory shared contracts and creator collections. The newest mints appear first, and older items load as you keep scrolling."
            : "Moderation-focused view of the same live listing stream. Keep filters tight, validate context, and report from here before moving to admin actions."}
        </p>
        <div className="row">
          <button type="button" onClick={() => setShowFilters((value) => !value)}>
            Filters
          </button>
          <button type="button" onClick={() => void loadInitial(true)} disabled={isLoading}>
            {isLoading ? "Loading..." : "Refresh"}
          </button>
          {mode === "mod" && canLoadMore ? (
            <button type="button" onClick={() => void loadMore()} disabled={isLoadingMore}>
              {isLoadingMore ? "Loading more..." : "Load More"}
            </button>
          ) : null}
        </div>

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
        {tradeMessage ? <p className="success">{tradeMessage}</p> : null}
        {hasActiveFilters ? (
          <div className="row">
            <p className="hint">Filters are active. Clear them if you expected a broader feed.</p>
            <button type="button" className="miniBtn" onClick={resetFilters}>
              Clear Filters
            </button>
          </div>
        ) : null}
      </div>

      <div className="listTable">
        {mode === "feed"
          ? (filtered as FeedRow[]).map((row) => {
              const contractExplorer = toExplorerAddress(row.collection.contractAddress, config.chainId);
              const ownerExplorer = toExplorerAddress(row.ownerAddress, config.chainId);
              const creatorExplorer = toExplorerAddress(row.creatorAddress, config.chainId);
              const mintedAtLabel = Number.isNaN(new Date(row.mintedAt).getTime())
                ? row.mintedAt
                : new Date(row.mintedAt).toLocaleString();
              const metadataLink = ipfsToGatewayUrl(row.metadataCid, ipfsGateway);
              const mediaLink = ipfsToGatewayUrl(row.mediaCid, ipfsGateway);
              const preview = feedPreviewIndex[row.id] || {
                name: null,
                description: null,
                imageUrl: looksLikeImageUrl(mediaLink) ? mediaLink : null,
                audioUrl: looksLikeAudioUrl(mediaLink) ? mediaLink : null
              };
              const ownerHolding = getOwnerHoldingPresentation({
                standard: row.collection.standard,
                tokenId: row.tokenId,
                ensSubname: row.collection.ensSubname,
                draftName: getDraftName(row),
                draftDescription: getDraftDescription(row),
                previewName: preview?.name,
                previewDescription: preview?.description,
                heldAmountRaw: getHeldAmountRaw(row),
                reservedAmountRaw: getReservedAmountRaw(row),
                availableAmountRaw: getAvailableAmountRaw(row),
                mintedAmountRaw: getMintedAmountRaw(row),
                activeListing: row.activeListing
                  ? {
                      listingId: row.activeListing.listingId,
                      paymentToken: row.activeListing.paymentToken,
                      priceRaw: row.activeListing.priceRaw
                    }
                  : null
              });
              const txLink = toExplorerTx(config.chainId, row.mintTxHash);
              const isOwnListing = Boolean(
                address && row.activeListing && row.activeListing.sellerAddress.toLowerCase() === address.toLowerCase()
              );

              return (
                <article key={row.id} className="feedCard">
                  <div className="feedCardHero">
                    <FeedCardMedia
                      preview={preview}
                      metadataLink={metadataLink}
                      mediaLink={mediaLink}
                      title={ownerHolding.title}
                    />

                    <div className="feedCardContent">
                      <div className="feedCardTop">
                        <span className="feedCardStatus">{ownerHolding.statusLabel}</span>
                      </div>

                      <div className="feedCardBody">
                        <div className="feedCardMain">
                          <p className="feedCardEyebrow">
                            {getMintSourceLabel(sharedContractAddresses.has(row.collection.contractAddress.toLowerCase()))}
                          </p>
                          <h3 className="feedCardTitle">{ownerHolding.title}</h3>
                          <p className="feedCardMetaLine">{ownerHolding.description}</p>
                          {ownerHolding.collectionIdentity ? <p className="feedCardMetaLine">Collection {ownerHolding.collectionIdentity}</p> : null}
                          <p className="feedCardMetaLine">
                            Created{" "}
                            {txLink ? (
                              <a href={txLink} target="_blank" rel="noreferrer">
                                {mintedAtLabel}
                              </a>
                            ) : (
                              mintedAtLabel
                            )}
                          </p>
                          <p className="feedCardMetaLine">
                            Created on {appChain.name} (chain {row.collection.chainId})
                          </p>
                        </div>

                        <div className="feedCardFacts">
                          <div className="feedFact">
                            <span className="feedFactLabel">{row.collection.standard.toUpperCase() === "ERC1155" ? "Supply" : "Amount"}</span>
                            <span className="detailValue">{ownerHolding.supplyAmountLabel}</span>
                          </div>
                          {getHeldAmountRaw(row) ? (
                            <div className="feedFact">
                              <span className="feedFactLabel">Held</span>
                              <span className="detailValue">{ownerHolding.heldAmountLabel}</span>
                            </div>
                          ) : null}
                          {ownerHolding.reservedAmountLabel ? (
                            <div className="feedFact">
                              <span className="feedFactLabel">Listed</span>
                              <span className="detailValue">{ownerHolding.reservedAmountLabel}</span>
                            </div>
                          ) : null}
                          {ownerHolding.availableAmountLabel ? (
                            <div className="feedFact">
                              <span className="feedFactLabel">Available</span>
                              <span className="detailValue">{ownerHolding.availableAmountLabel}</span>
                            </div>
                          ) : null}
                          <div className="feedFact">
                            <span className="feedFactLabel">Contract</span>
                            {contractExplorer ? (
                              <a href={contractExplorer} target="_blank" rel="noreferrer" className="mono">
                                {truncateAddress(row.collection.contractAddress)}
                              </a>
                            ) : (
                              <span className="mono">{truncateAddress(row.collection.contractAddress)}</span>
                            )}
                          </div>

                          <div className="feedFact">
                            <span className="feedFactLabel">Owner</span>
                            {ownerExplorer ? (
                              <a href={ownerExplorer} target="_blank" rel="noreferrer" className="mono">
                                {truncateAddress(row.ownerAddress)}
                              </a>
                            ) : (
                              <span className="mono">{truncateAddress(row.ownerAddress)}</span>
                            )}
                          </div>

                          <div className="feedFact">
                            <span className="feedFactLabel">Creator</span>
                            {creatorExplorer ? (
                              <a href={creatorExplorer} target="_blank" rel="noreferrer" className="mono">
                                {truncateAddress(row.creatorAddress)}
                              </a>
                            ) : (
                              <span className="mono">{truncateAddress(row.creatorAddress)}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="feedCardLinks">
                    {metadataLink ? (
                      <a href={metadataLink} target="_blank" rel="noreferrer" className="feedLinkPill">
                        View metadata
                      </a>
                    ) : (
                      <span className="feedLinkPill muted">Metadata pending</span>
                    )}
                    {mediaLink ? (
                      <a href={mediaLink} target="_blank" rel="noreferrer" className="feedLinkPill">
                        View media
                      </a>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void buyNow(row)}
                      disabled={!row.activeListing || !isConnected || wrongNetwork || isOwnListing || buyingListingId === getListingActionKey(row.activeListing)}
                    >
                      {buyingListingId === getListingActionKey(row.activeListing)
                        ? "Buying..."
                        : isOwnListing
                          ? "Your listing"
                          : "Buy now"}
                    </button>
                    <button
                      type="button"
                      className="miniBtn"
                      onClick={() => (offerDraft?.rowId === row.id ? closeOfferComposer() : openOfferComposer(row))}
                    >
                      {offerDraft?.rowId === row.id ? "Close offer" : "Make offer"}
                    </button>
                    {row.activeListing ? (
                      <Link href="/list" className="feedLinkPill muted">
                        Open listing tools
                      </Link>
                    ) : (
                      <Link href="/mint" className="feedLinkPill muted">
                        Mint more
                      </Link>
                    )}
                  </div>
                  {offerDraft?.rowId === row.id ? (
                    <div className="selectionCard offerComposerCard">
                      {row.collection.standard.toUpperCase() === "ERC1155" && getHeldAmountRaw(row) ? (
                        <p className="hint">
                          Indexed holder balance: {getMintAmountLabel(row.collection.standard, getHeldAmountRaw(row), "Balance not indexed")}.
                        </p>
                      ) : null}
                      <div className="gridMini">
                        <label>
                          Payment asset
                          <select
                            value={offerDraft.paymentTokenType}
                            onChange={(e) =>
                              setOfferDraft((current) =>
                                current && current.rowId === row.id
                                  ? {
                                      ...current,
                                      paymentTokenType: e.target.value as "ETH" | "ERC20",
                                      erc20Address:
                                        e.target.value === "ERC20" ? current.erc20Address || row.activeListing?.paymentToken || "" : ""
                                    }
                                  : current
                              )
                            }
                          >
                            <option value="ETH">ETH</option>
                            <option value="ERC20">Custom ERC20</option>
                          </select>
                        </label>
                        {offerDraft.paymentTokenType === "ERC20" ? (
                          <label>
                            ERC20 contract
                            <input
                              value={offerDraft.erc20Address}
                              onChange={(e) =>
                                setOfferDraft((current) =>
                                  current && current.rowId === row.id ? { ...current, erc20Address: e.target.value } : current
                                )
                              }
                              placeholder="0x..."
                            />
                          </label>
                        ) : null}
                        <label>
                          {offerDraft.paymentTokenType === "ETH" ? "Offer total (ETH)" : "Offer total (token units)"}
                          <input
                            value={offerDraft.priceInput}
                            onChange={(e) =>
                              setOfferDraft((current) =>
                                current && current.rowId === row.id ? { ...current, priceInput: e.target.value } : current
                              )
                            }
                            placeholder={offerDraft.paymentTokenType === "ETH" ? "0.05" : "1000000"}
                          />
                        </label>
                        <label>
                          Duration (days)
                          <input
                            value={offerDraft.durationDays}
                            onChange={(e) =>
                              setOfferDraft((current) =>
                                current && current.rowId === row.id ? { ...current, durationDays: e.target.value } : current
                              )
                            }
                            inputMode="numeric"
                            placeholder="7"
                          />
                        </label>
                        {row.collection.standard.toUpperCase() === "ERC1155" ? (
                          <label>
                            Quantity
                            <input
                              value={offerDraft.quantity}
                              onChange={(e) =>
                                setOfferDraft((current) =>
                                  current && current.rowId === row.id ? { ...current, quantity: e.target.value } : current
                                )
                              }
                              inputMode="numeric"
                              min="1"
                              max={parsePositiveQuantityRaw(getHeldAmountRaw(row))?.toString()}
                              placeholder="1"
                            />
                          </label>
                        ) : null}
                      </div>
                      <p className="hint">
                        Offers are escrowed in Marketplace V2. ETH offers send value with the transaction. ERC20 offers approve and escrow the total amount first.
                      </p>
                      <div className="row">
                        <button
                          type="button"
                          onClick={() => void submitOffer(row)}
                          disabled={!isConnected || wrongNetwork || submittingOfferRowId === row.id}
                        >
                          {submittingOfferRowId === row.id ? "Submitting offer..." : "Submit offer"}
                        </button>
                        <button type="button" className="miniBtn" onClick={closeOfferComposer} disabled={submittingOfferRowId === row.id}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })
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
