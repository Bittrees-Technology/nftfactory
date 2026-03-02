"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Address } from "viem";
import { zeroAddress } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { getContractsConfig } from "../../lib/contracts";
import {
  fetchActiveListingsBatch,
  formatListingPrice,
  toExplorerAddress,
  truncateAddress,
  ZERO_ADDRESS,
  type MarketplaceListing
} from "../../lib/marketplace";
import { createModerationReport, fetchHiddenListingIds, fetchMintFeed, type ApiMintFeedItem } from "../../lib/indexerApi";

type SortBy = "newest" | "priceAsc" | "priceDesc";
type SourceFilter = "ALL" | "SHARED" | "CUSTOM";
type StandardFilter = "ALL" | "ERC721" | "ERC1155";
type ListedFilter = "ALL" | "LISTED" | "UNLISTED";

type DiscoverCache = {
  ts: number;
  listings: MarketplaceListing[];
  cursor: number;
  canLoadMore: boolean;
  pageSize: number;
};

type MintFeedCache = {
  ts: number;
  items: ApiMintFeedItem[];
  cursor: number;
  canLoadMore: boolean;
  pageSize: number;
};

type LocalMintFeedCache = {
  items: ApiMintFeedItem[];
};

type KnownCollection = {
  contractAddress: string;
  ensSubname: string | null;
  ownerAddress: string;
};

const CACHE_TTL_MS = 60_000;
const FEED_BATCH_SIZE = 50;

function cacheKey(marketplace: string): string {
  return `nftfactory:discover-cache:v2:${marketplace.toLowerCase()}`;
}

function mintFeedCacheKey(chainId: number): string {
  return `nftfactory:mint-feed-cache:v1:${chainId}`;
}

function localMintFeedKey(chainId: number): string {
  return `nftfactory:local-mint-feed:v1:${chainId}`;
}

function knownCollectionsKey(ownerAddress: string): string {
  return `nftfactory:known-collections:${ownerAddress.toLowerCase()}`;
}

function readCache(marketplace: string): DiscoverCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(cacheKey(marketplace));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DiscoverCache;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(marketplace: string, payload: Omit<DiscoverCache, "ts">): void {
  if (typeof window === "undefined") return;
  const cached: DiscoverCache = { ...payload, ts: Date.now() };
  window.sessionStorage.setItem(cacheKey(marketplace), JSON.stringify(cached));
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

function readLocalMintFeed(chainId: number): ApiMintFeedItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(localMintFeedKey(chainId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalMintFeedCache | ApiMintFeedItem[];
    if (Array.isArray(parsed)) return parsed;
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

function readKnownCollections(ownerAddress: string): KnownCollection[] {
  if (typeof window === "undefined" || !ownerAddress) return [];
  try {
    const raw = window.localStorage.getItem(knownCollectionsKey(ownerAddress));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as KnownCollection[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const erc721TransferEvent = {
  type: "event",
  name: "Transfer",
  inputs: [
    { indexed: true, name: "from", type: "address" },
    { indexed: true, name: "to", type: "address" },
    { indexed: true, name: "tokenId", type: "uint256" }
  ]
} as const;

const erc721ReadAbi = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }]
  }
] as const;

const erc1155TransferSingleEvent = {
  type: "event",
  name: "TransferSingle",
  inputs: [
    { indexed: true, name: "operator", type: "address" },
    { indexed: true, name: "from", type: "address" },
    { indexed: true, name: "to", type: "address" },
    { indexed: false, name: "id", type: "uint256" },
    { indexed: false, name: "value", type: "uint256" }
  ]
} as const;

const erc1155TransferBatchEvent = {
  type: "event",
  name: "TransferBatch",
  inputs: [
    { indexed: true, name: "operator", type: "address" },
    { indexed: true, name: "from", type: "address" },
    { indexed: true, name: "to", type: "address" },
    { indexed: false, name: "ids", type: "uint256[]" },
    { indexed: false, name: "values", type: "uint256[]" }
  ]
} as const;

const erc1155ReadAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" }
    ],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "uri",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "string" }]
  }
] as const;

function normalizeAddress(value: string): value is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

type DiscoverClientProps = {
  mode?: "feed" | "mod";
};

function ipfsToGatewayUrl(value: string | null | undefined, gateway: string): string | null {
  if (!value) return null;
  if (value.startsWith("ipfs://")) {
    return `${gateway}/${value.replace("ipfs://", "")}`;
  }
  return value;
}

function looksLikeImageUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  return /\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i.test(value) || value.includes("/ipfs/");
}

function looksLikeAudioUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  return /\.(mp3|wav|ogg|m4a|aac|flac)(\?.*)?$/i.test(value);
}

function FeedCardMedia({
  metadataLink,
  mediaLink,
  ipfsGateway,
  title
}: {
  metadataLink: string | null;
  mediaLink: string | null;
  ipfsGateway: string;
  title: string;
}) {
  const [resolvedImage, setResolvedImage] = useState<string | null>(looksLikeImageUrl(mediaLink) ? mediaLink : null);
  const [resolvedAudio, setResolvedAudio] = useState<string | null>(looksLikeAudioUrl(mediaLink) ? mediaLink : null);

  useEffect(() => {
    let cancelled = false;

    if (looksLikeImageUrl(mediaLink)) {
      setResolvedImage(mediaLink);
      setResolvedAudio(null);
      return;
    }

    if (looksLikeAudioUrl(mediaLink)) {
      setResolvedImage(null);
      setResolvedAudio(mediaLink);
      return;
    }

    if (!metadataLink) {
      setResolvedImage(null);
      setResolvedAudio(null);
      return;
    }

    setResolvedImage(null);
    setResolvedAudio(null);
    void fetch(metadataLink)
      .then(async (response) => {
        if (!response.ok) throw new Error("metadata unavailable");
        return response.json() as Promise<{
          image?: string;
          image_url?: string;
          animation_url?: string;
          animationUrl?: string;
        }>;
      })
      .then((payload) => {
        if (cancelled) return;
        const next = ipfsToGatewayUrl(payload.image || payload.image_url || null, ipfsGateway);
        const nextAudio = ipfsToGatewayUrl(payload.animation_url || payload.animationUrl || null, ipfsGateway);
        setResolvedImage(looksLikeImageUrl(next) ? next : null);
        setResolvedAudio(looksLikeAudioUrl(nextAudio) ? nextAudio : null);
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedImage(null);
          setResolvedAudio(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [ipfsGateway, mediaLink, metadataLink]);

  if (resolvedImage) {
    return (
      <div className="feedCardMedia">
        <img src={resolvedImage} alt={title} className="feedCardImage" />
      </div>
    );
  }

  if (resolvedAudio) {
    return (
      <div className="feedCardMedia feedCardMediaFallback">
        <div className="feedCardFallbackCopy">
          <span className="feedCardFallbackLabel">Audio drop</span>
          <strong>{title}</strong>
        </div>
        <audio controls src={resolvedAudio} className="feedCardAudio">
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

export default function DiscoverClient({ mode = "feed" }: DiscoverClientProps) {
  const config = useMemo(() => getContractsConfig(), []);
  const ipfsGateway = useMemo(
    () => (process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs").replace(/\/$/, ""),
    []
  );
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const [allListings, setAllListings] = useState<MarketplaceListing[]>([]);
  const [feedItems, setFeedItems] = useState<ApiMintFeedItem[]>([]);
  const [localFeedItems, setLocalFeedItems] = useState<ApiMintFeedItem[]>([]);
  const [hydratedFeedItems, setHydratedFeedItems] = useState<ApiMintFeedItem[]>([]);
  const [feedSearchIndex, setFeedSearchIndex] = useState<Record<string, string>>({});
  const [hiddenListingIds, setHiddenListingIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [indexerStatus, setIndexerStatus] = useState("");

  const [cursor, setCursor] = useState(0);
  const [canLoadMore, setCanLoadMore] = useState(false);

  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("ALL");
  const [standardFilter, setStandardFilter] = useState<StandardFilter>("ALL");
  const [listedFilter, setListedFilter] = useState<ListedFilter>("ALL");
  const [searchFilter, setSearchFilter] = useState("");
  const [sellerFilter, setSellerFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("newest");

  const [reporter, setReporter] = useState("");
  const [reportingId, setReportingId] = useState<number | null>(null);
  const [reportReason, setReportReason] = useState("spam");
  const [showFilters, setShowFilters] = useState(false);

  const hasActiveFilters = Boolean(
    sourceFilter !== "ALL" ||
    standardFilter !== "ALL" ||
    listedFilter !== "ALL" ||
    searchFilter.trim() ||
    sellerFilter.trim() ||
    sortBy !== "newest"
  );
  const canReport = normalizeAddress(reporter);

  const refreshHidden = useCallback(async () => {
    try {
      setIndexerStatus("");
      setHiddenListingIds(await fetchHiddenListingIds());
    } catch {
      setHiddenListingIds([]);
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

        if (!forceReload) {
          const cached = readCache(config.marketplace);
          if (cached && cached.pageSize === limit) {
            setAllListings(cached.listings);
            setCursor(cached.cursor);
            setCanLoadMore(cached.canLoadMore);
            return;
          }
        }

        const result = await fetchActiveListingsBatch({
          chainId: config.chainId,
          rpcUrl: config.rpcUrl,
          marketplace: config.marketplace as Address,
          cursor: null,
          limit
        });

        setAllListings(result.listings);
        setCursor(result.nextCursor);
        setCanLoadMore(result.canLoadMore);

        writeCache(config.marketplace, {
          listings: result.listings,
          cursor: result.nextCursor,
          canLoadMore: result.canLoadMore,
          pageSize: limit
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load listings.");
      } finally {
        setIsLoading(false);
      }
    },
    [config.chainId, config.marketplace, config.rpcUrl, mode]
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

      const result = await fetchActiveListingsBatch({
        chainId: config.chainId,
        rpcUrl: config.rpcUrl,
        marketplace: config.marketplace as Address,
        cursor,
        limit
      });

      const merged = [...allListings, ...result.listings];
      setAllListings(merged);
      setCursor(result.nextCursor);
      setCanLoadMore(result.canLoadMore);

      writeCache(config.marketplace, {
        listings: merged,
        cursor: result.nextCursor,
        canLoadMore: result.canLoadMore,
        pageSize: limit
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load more listings.");
    } finally {
      setIsLoadingMore(false);
    }
  }, [allListings, canLoadMore, config.chainId, config.marketplace, config.rpcUrl, cursor, feedItems, mode]);

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
    if (!reporter && address) {
      setReporter(address);
    }
  }, [address, reporter]);

  useEffect(() => {
    if (mode !== "feed" || !address || !publicClient) return;

    let cancelled = false;

    const indexedContracts = new Set(
      [...feedItems, ...localFeedItems].map((item) => item.collection.contractAddress.toLowerCase())
    );
    const candidateCollections = readKnownCollections(address).filter(
      (item) =>
        item.ownerAddress.toLowerCase() === address.toLowerCase() &&
        !indexedContracts.has(item.contractAddress.toLowerCase())
    );

    if (candidateCollections.length === 0) {
      setHydratedFeedItems([]);
      return;
    }

    void Promise.all(
      candidateCollections.slice(0, 4).map(async (collection) => {
        try {
          const blockTimes = new Map<string, string>();
          const getBlockTime = async (blockNumber: bigint): Promise<string> => {
            const key = blockNumber.toString();
            if (!blockTimes.has(key)) {
              const block = await publicClient.getBlock({ blockNumber });
              blockTimes.set(key, new Date(Number(block.timestamp) * 1000).toISOString());
            }
            return blockTimes.get(key) || new Date().toISOString();
          };

          try {
            const logs = await publicClient.getLogs({
              address: collection.contractAddress as Address,
              event: erc721TransferEvent,
              fromBlock: 0n,
              toBlock: "latest"
            });

            const mintedLogs = logs.filter((log) => log.args.from?.toLowerCase() === zeroAddress);
            const items = await Promise.all(
              mintedLogs.map(async (log) => {
                const tokenId = log.args.tokenId?.toString();
                if (!tokenId) return null;

                let ownerAddress = "";
                let metadataCid = "";

                try {
                  ownerAddress = (await publicClient.readContract({
                    address: collection.contractAddress as Address,
                    abi: erc721ReadAbi,
                    functionName: "ownerOf",
                    args: [BigInt(tokenId)]
                  })) as string;
                } catch {
                  return null;
                }

                if (ownerAddress.toLowerCase() !== address.toLowerCase()) return null;

                try {
                  metadataCid = (await publicClient.readContract({
                    address: collection.contractAddress as Address,
                    abi: erc721ReadAbi,
                    functionName: "tokenURI",
                    args: [BigInt(tokenId)]
                  })) as string;
                } catch {
                  metadataCid = "";
                }

                const timestamp = await getBlockTime(log.blockNumber);
                return {
                  id: `hydrated:${collection.contractAddress.toLowerCase()}:${tokenId}`,
                  tokenId,
                  creatorAddress: address.toLowerCase(),
                  ownerAddress: ownerAddress.toLowerCase(),
                  metadataCid,
                  metadataUrl: ipfsToGatewayUrl(metadataCid, ipfsGateway),
                  mediaCid: null,
                  mediaUrl: null,
                  immutable: true,
                  mintedAt: timestamp,
                  collection: {
                    chainId: config.chainId,
                    contractAddress: collection.contractAddress.toLowerCase(),
                    ownerAddress: address.toLowerCase(),
                    ensSubname: collection.ensSubname,
                    standard: "ERC721",
                    isFactoryCreated: false,
                    isUpgradeable: true,
                    finalizedAt: null,
                    createdAt: timestamp,
                    updatedAt: timestamp
                  },
                  activeListing: null
                } satisfies ApiMintFeedItem;
              })
            );

            const filteredItems = items.filter(Boolean) as ApiMintFeedItem[];
            if (filteredItems.length > 0) {
              return filteredItems;
            }
          } catch {
            // Fall through to ERC-1155 probing.
          }

          const singleLogs = await publicClient.getLogs({
            address: collection.contractAddress as Address,
            event: erc1155TransferSingleEvent,
            fromBlock: 0n,
            toBlock: "latest"
          });
          const batchLogs = await publicClient.getLogs({
            address: collection.contractAddress as Address,
            event: erc1155TransferBatchEvent,
            fromBlock: 0n,
            toBlock: "latest"
          });

          const mintedTokenIds = new Map<string, string>();
          for (const log of singleLogs) {
            if (log.args.from?.toLowerCase() === zeroAddress) {
              mintedTokenIds.set(log.args.id?.toString() || "", await getBlockTime(log.blockNumber));
            }
          }
          for (const log of batchLogs) {
            if (log.args.from?.toLowerCase() === zeroAddress) {
              for (const id of log.args.ids || []) {
                mintedTokenIds.set(id.toString(), await getBlockTime(log.blockNumber));
              }
            }
          }

          const items = await Promise.all(
            [...mintedTokenIds.entries()]
              .filter(([tokenId]) => Boolean(tokenId))
              .map(async ([tokenId, mintedAt]) => {
                let balance = 0n;
                let metadataCid = "";

                try {
                  balance = (await publicClient.readContract({
                    address: collection.contractAddress as Address,
                    abi: erc1155ReadAbi,
                    functionName: "balanceOf",
                    args: [address as Address, BigInt(tokenId)]
                  })) as bigint;
                } catch {
                  return null;
                }

                if (balance <= 0n) return null;

                try {
                  metadataCid = (await publicClient.readContract({
                    address: collection.contractAddress as Address,
                    abi: erc1155ReadAbi,
                    functionName: "uri",
                    args: [BigInt(tokenId)]
                  })) as string;
                } catch {
                  metadataCid = "";
                }

                return {
                  id: `hydrated:${collection.contractAddress.toLowerCase()}:${tokenId}`,
                  tokenId,
                  creatorAddress: address.toLowerCase(),
                  ownerAddress: address.toLowerCase(),
                  metadataCid,
                  metadataUrl: ipfsToGatewayUrl(metadataCid, ipfsGateway),
                  mediaCid: null,
                  mediaUrl: null,
                  immutable: true,
                  mintedAt,
                  collection: {
                    chainId: config.chainId,
                    contractAddress: collection.contractAddress.toLowerCase(),
                    ownerAddress: address.toLowerCase(),
                    ensSubname: collection.ensSubname,
                    standard: "ERC1155",
                    isFactoryCreated: false,
                    isUpgradeable: true,
                    finalizedAt: null,
                    createdAt: mintedAt,
                    updatedAt: mintedAt
                  },
                  activeListing: null
                } satisfies ApiMintFeedItem;
              })
          );

          return items.filter(Boolean) as ApiMintFeedItem[];
        } catch {
          return [];
        }
      })
    ).then((groups) => {
      if (!cancelled) {
        setHydratedFeedItems(groups.flat());
      }
    });

    return () => {
      cancelled = true;
    };
  }, [address, config.chainId, feedItems, ipfsGateway, localFeedItems, mode, publicClient]);

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
    const merged = [...localFeedItems, ...hydratedFeedItems, ...feedItems];
    const deduped = new Map<string, ApiMintFeedItem>();
    for (const item of merged) {
      const key = `${item.collection.contractAddress.toLowerCase()}:${item.tokenId}`;
      if (!deduped.has(key)) {
        deduped.set(key, item);
      }
    }
    return [...deduped.values()];
  }, [feedItems, hydratedFeedItems, localFeedItems, mode]);

  useEffect(() => {
    if (mode !== "feed") return;
    if (allFeedItems.length === 0) {
      setFeedSearchIndex({});
      return;
    }

    let cancelled = false;
    const nextIndex: Record<string, string> = {};

    void Promise.all(
      allFeedItems.map(async (item) => {
        const metadataLink = ipfsToGatewayUrl(item.metadataCid, ipfsGateway);
        if (!metadataLink) return;
        try {
          const response = await fetch(metadataLink);
          if (!response.ok) return;
          const payload = (await response.json()) as {
            name?: string;
            title?: string;
            description?: string;
          };
          nextIndex[item.id] = [payload.name, payload.title, payload.description]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
        } catch {
          // leave blank when metadata is unavailable
        }
      })
    ).then(() => {
      if (!cancelled) {
        setFeedSearchIndex(nextIndex);
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
        rows = rows.filter((row) =>
          sourceFilter === "SHARED" ? row.collection.isFactoryCreated : !row.collection.isFactoryCreated
        );
      }

      if (standardFilter !== "ALL") {
        rows = rows.filter((row) => row.collection.standard.toUpperCase() === standardFilter);
      }

      if (listedFilter !== "ALL") {
        rows = rows.filter((row) => (listedFilter === "LISTED" ? Boolean(row.activeListing) : !row.activeListing));
      }

      if (normalizedSearchFilter) {
        rows = rows.filter((row) => {
          const collectionLabel = row.collection.ensSubname?.trim()
            ? row.collection.ensSubname.includes(".")
              ? row.collection.ensSubname
              : `${row.collection.ensSubname}.nftfactory.eth`
            : "";
          const searchable = [
            row.collection.contractAddress,
            row.collection.standard,
            row.collection.isFactoryCreated ? "shared" : "custom",
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
    const hiddenSet = new Set(hiddenListingIds);

    let rows = allListings.filter((row) => !hiddenSet.has(row.id));

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
      sorted.sort((a, b) => b.id - a.id);
    }
    return sorted;
  }, [
    allListings,
    config.shared721,
    config.shared1155,
    sourceFilter,
    standardFilter,
    listedFilter,
    searchFilter,
    sellerFilter,
    sortBy,
    hiddenListingIds,
    mode,
    allFeedItems,
    feedSearchIndex
  ]);

  async function submitReport(listing: MarketplaceListing): Promise<void> {
    if (!normalizeAddress(reporter)) {
      setError("Enter a valid reporter wallet address before submitting a report.");
      return;
    }
    try {
      setError("");
      await createModerationReport({
        listingId: listing.id,
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

  function resetFilters(): void {
    setSourceFilter("ALL");
    setStandardFilter("ALL");
    setListedFilter("ALL");
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
            : `Showing ${filtered.length} listing(s). Hidden by moderation: ${hiddenListingIds.length}.`}
        </p>
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
          ? (filtered as ApiMintFeedItem[]).map((row) => {
              const contractExplorer = toExplorerAddress(row.collection.contractAddress, config.chainId);
              const ownerExplorer = toExplorerAddress(row.ownerAddress, config.chainId);
              const creatorExplorer = toExplorerAddress(row.creatorAddress, config.chainId);
              const mintedAtLabel = Number.isNaN(new Date(row.mintedAt).getTime())
                ? row.mintedAt
                : new Date(row.mintedAt).toLocaleString();
              const metadataLink = ipfsToGatewayUrl(row.metadataCid, ipfsGateway);
              const mediaLink = ipfsToGatewayUrl(row.mediaCid, ipfsGateway);
              const ensLabel = row.collection.ensSubname?.trim()
                ? row.collection.ensSubname.includes(".")
                  ? row.collection.ensSubname
                  : `${row.collection.ensSubname}.nftfactory.eth`
                : null;
              const priceLabel = row.activeListing
                ? row.activeListing.paymentToken === ZERO_ADDRESS
                  ? `${formatListingPrice({
                      id: Number.parseInt(row.activeListing.listingId, 10) || 0,
                      seller: row.activeListing.sellerAddress as Address,
                      nft: row.collection.contractAddress as Address,
                      tokenId: BigInt(row.tokenId),
                      amount: 1n,
                      standard: row.collection.standard,
                      paymentToken: row.activeListing.paymentToken as Address,
                      price: BigInt(row.activeListing.priceRaw),
                      expiresAt: 0n,
                      active: true
                    })}`
                  : "Listed (ERC20)"
                : "Not listed";

              return (
                <article key={row.id} className="feedCard">
                  <FeedCardMedia
                    metadataLink={metadataLink}
                    mediaLink={mediaLink}
                    ipfsGateway={ipfsGateway}
                    title={`${ensLabel || "NFTFactory mint"} #${row.tokenId}`}
                  />
                  <div className="feedCardTop">
                    <p className="feedCardStamp">{mintedAtLabel}</p>
                    <span className="feedCardStatus">{priceLabel}</span>
                  </div>

                  <div className="feedCardBody">
                    <div className="feedCardMain">
                      <p className="feedCardEyebrow">
                        {row.collection.isFactoryCreated ? "NFTFactory shared mint" : "Creator collection mint"}
                      </p>
                      <h3 className="feedCardTitle">
                        {ensLabel || "Untitled collection"} <span>#{row.tokenId}</span>
                      </h3>
                      <p className="feedCardMetaLine">
                        {row.collection.standard} minted on chain {row.collection.chainId}
                      </p>
                    </div>

                    <div className="feedCardFacts">
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
                </article>
              );
            })
          : (filtered as MarketplaceListing[]).map((row) => (
              <article key={row.id} className="listRow">
                <span>
                  <strong>Listing</strong> #{row.id}
                </span>
                <span>
                  <strong>Standard</strong> {row.standard}
                </span>
                <span>
                  <strong>Token</strong> #{row.tokenId.toString()}
                </span>
                <span>
                  <strong>Amount</strong> {row.amount.toString()}
                </span>
                <span>
                  <strong>Price</strong> {formatListingPrice(row)}
                </span>
                {toExplorerAddress(row.nft, config.chainId) ? (
                  <a href={toExplorerAddress(row.nft, config.chainId)!} target="_blank" rel="noreferrer" className="mono">
                    Contract {truncateAddress(row.nft)}
                  </a>
                ) : (
                  <span className="mono">Contract {truncateAddress(row.nft)}</span>
                )}
                {toExplorerAddress(row.seller, config.chainId) ? (
                  <a href={toExplorerAddress(row.seller, config.chainId)!} target="_blank" rel="noreferrer" className="mono">
                    Seller {truncateAddress(row.seller)}
                  </a>
                ) : (
                  <span className="mono">Seller {truncateAddress(row.seller)}</span>
                )}
                {reportingId === row.id ? (
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
                  <button type="button" className="miniBtn" onClick={() => setReportingId(row.id)}>
                    Report
                  </button>
                )}
              </article>
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
