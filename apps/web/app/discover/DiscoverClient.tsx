"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import { useAccount } from "wagmi";
import { getContractsConfig } from "../../lib/contracts";
import {
  fetchActiveListingsBatch,
  formatListingPrice,
  toExplorerAddress,
  truncateAddress,
  ZERO_ADDRESS,
  type MarketplaceListing
} from "../../lib/marketplace";
import { toWeiBigInt } from "../../lib/abi";
import { createModerationReport, fetchHiddenListingIds } from "../../lib/indexerApi";

type SortBy = "newest" | "priceAsc" | "priceDesc";
type SourceFilter = "ALL" | "SHARED" | "CUSTOM";
type StandardFilter = "ALL" | "ERC721" | "ERC1155";

type DiscoverCache = {
  ts: number;
  listings: MarketplaceListing[];
  cursor: number;
  canLoadMore: boolean;
  pageSize: number;
};

const CACHE_TTL_MS = 60_000;

function cacheKey(marketplace: string): string {
  return `nftfactory:discover-cache:v2:${marketplace.toLowerCase()}`;
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

function normalizeAddress(value: string): value is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export default function DiscoverClient() {
  const config = useMemo(() => getContractsConfig(), []);
  const { address } = useAccount();

  const [allListings, setAllListings] = useState<MarketplaceListing[]>([]);
  const [hiddenListingIds, setHiddenListingIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [indexerStatus, setIndexerStatus] = useState("");

  const [pageSize, setPageSize] = useState("50");
  const [cursor, setCursor] = useState(0);
  const [canLoadMore, setCanLoadMore] = useState(false);

  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("ALL");
  const [standardFilter, setStandardFilter] = useState<StandardFilter>("ALL");
  const [maxPriceEth, setMaxPriceEth] = useState("");
  const [contractFilter, setContractFilter] = useState("");
  const [sellerFilter, setSellerFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("newest");

  const [reporter, setReporter] = useState("");
  const [reportingId, setReportingId] = useState<number | null>(null);
  const [reportReason, setReportReason] = useState("spam");

  const hasActiveFilters = Boolean(
    sourceFilter !== "ALL" ||
    standardFilter !== "ALL" ||
    maxPriceEth.trim() ||
    contractFilter.trim() ||
    sellerFilter.trim() ||
    sortBy !== "newest"
  );

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
        const parsedPageSize = Number.parseInt(pageSize, 10);
        const limit = Number.isInteger(parsedPageSize) && parsedPageSize > 0 ? parsedPageSize : 50;

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
    [config.marketplace, config.rpcUrl, pageSize]
  );

  const loadMore = useCallback(async (): Promise<void> => {
    if (!canLoadMore) return;
    setIsLoadingMore(true);
    setError("");
    try {
      const parsedPageSize = Number.parseInt(pageSize, 10);
      const limit = Number.isInteger(parsedPageSize) && parsedPageSize > 0 ? parsedPageSize : 50;

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
  }, [allListings, canLoadMore, config.marketplace, config.rpcUrl, cursor, pageSize]);

  useEffect(() => {
    void loadInitial(false);
  }, [loadInitial]);

  useEffect(() => {
    void refreshHidden();
  }, [refreshHidden]);

  useEffect(() => {
    if (!reporter && address) {
      setReporter(address);
    }
  }, [address, reporter]);

  const filtered = useMemo(() => {
    const shared721 = config.shared721.toLowerCase();
    const shared1155 = config.shared1155.toLowerCase();
    const normalizedContractFilter = contractFilter.trim().toLowerCase();
    const normalizedSellerFilter = sellerFilter.trim().toLowerCase();
    let maxPriceWei: bigint | null = null;
    try {
      maxPriceWei = maxPriceEth.trim() ? toWeiBigInt(maxPriceEth.trim()) : null;
    } catch {
      maxPriceWei = null;
    }
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

    if (normalizedContractFilter) {
      rows = rows.filter((row) => row.nft.toLowerCase().includes(normalizedContractFilter));
    }

    if (normalizeAddress(normalizedSellerFilter)) {
      rows = rows.filter((row) => row.seller.toLowerCase() === normalizedSellerFilter);
    } else if (normalizedSellerFilter) {
      rows = rows.filter((row) => row.seller.toLowerCase().includes(normalizedSellerFilter));
    }

    if (maxPriceWei !== null) {
      rows = rows.filter((row) => row.paymentToken === ZERO_ADDRESS && row.price <= maxPriceWei!);
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
    contractFilter,
    sellerFilter,
    maxPriceEth,
    sortBy,
    hiddenListingIds
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
    setMaxPriceEth("");
    setContractFilter("");
    setSellerFilter("");
    setSortBy("newest");
  }

  return (
    <section className="wizard">
      <div className="heroCard">
        <p className="eyebrow">Marketplace Feed</p>
        <h1>Discover</h1>
        <p className="heroText">
          Read-only marketplace feed for collectors and reviewers. Use this route to inspect current
          listings, narrow the feed, and flag suspicious activity without entering seller mode.
        </p>
        <div className="row">
          <Link href="/profile" className="ctaLink secondaryLink">Open creator profiles</Link>
          <Link href="/list" className="ctaLink secondaryLink">Go to seller tools</Link>
        </div>
      </div>

      <div className="card formCard">
        <p className="hint">
          This page is intentionally read-only for browsing. Use List if you want to create or manage your own sale.
        </p>
        <div className="row">
          <label>
            Page size
            <input value={pageSize} onChange={(e) => setPageSize(e.target.value)} inputMode="numeric" placeholder="50" />
          </label>
          <button type="button" onClick={() => void loadInitial(true)} disabled={isLoading}>
            {isLoading ? "Loading..." : "Refresh"}
          </button>
          {canLoadMore ? (
            <button type="button" onClick={() => void loadMore()} disabled={isLoadingMore}>
              {isLoadingMore ? "Loading more..." : "Load More"}
            </button>
          ) : (
            <p className="hint">End of feed</p>
          )}
        </div>

        <div className="gridMini">
          <label>
            Source
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}>
              <option value="ALL">All</option>
              <option value="SHARED">NFTFactory shared</option>
              <option value="CUSTOM">Creator collections</option>
            </select>
          </label>

          <label>
            Standard
            <select value={standardFilter} onChange={(e) => setStandardFilter(e.target.value as StandardFilter)}>
              <option value="ALL">All</option>
              <option value="ERC721">ERC-721</option>
              <option value="ERC1155">ERC-1155</option>
            </select>
          </label>

          <label>
            Max price (ETH only)
            <input value={maxPriceEth} onChange={(e) => setMaxPriceEth(e.target.value)} placeholder="0.05" />
          </label>

          <label>
            Contract contains
            <input value={contractFilter} onChange={(e) => setContractFilter(e.target.value)} placeholder="0xabc..." />
          </label>

          <label>
            Seller
            <input value={sellerFilter} onChange={(e) => setSellerFilter(e.target.value)} placeholder="0xseller..." />
          </label>

          <label>
            Sort
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
              <option value="newest">Newest</option>
              <option value="priceAsc">Price low to high</option>
              <option value="priceDesc">Price high to low</option>
            </select>
          </label>
        </div>

        <div className="row">
          <label>
            Reporter address
            <input value={reporter} onChange={(e) => setReporter(e.target.value)} placeholder="0xreporter..." />
          </label>
        </div>
        {!reporter && !address ? <p className="hint">Connect wallet or enter reporter address manually.</p> : null}
      </div>

      {error ? <p className="error">{error}</p> : null}
      {indexerStatus ? <p className="hint">{indexerStatus}</p> : null}

      {error ? (
        <div className="card formCard">
          <h3>Feed Unavailable</h3>
          <p className="hint">
            Listing data could not be loaded from the configured chain. Confirm the RPC endpoint and retry
            refresh before assuming the marketplace is empty.
          </p>
          <div className="row">
            <button type="button" onClick={() => void loadInitial(true)} disabled={isLoading}>
              {isLoading ? "Retrying..." : "Retry Feed"}
            </button>
            <Link href="/list" className="ctaLink secondaryLink">Open seller tools</Link>
          </div>
        </div>
      ) : null}

      <div className="card">
        <p className="hint">
          Showing {filtered.length} listing(s). Hidden by moderation: {hiddenListingIds.length}.
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

      {filtered.length === 0 && !isLoading ? (
        <div className="card formCard">
          <h3>No Listings In View</h3>
          <p className="hint">
            {hasActiveFilters
              ? "Your current filters removed every visible listing. Clear filters or widen the page size to inspect more results."
              : "No listings are visible right now. Try refreshing, increasing page size, or switching to List if you expected to see your own inventory."}
          </p>
          <div className="row">
            {hasActiveFilters ? (
              <button type="button" onClick={resetFilters}>
                Reset Filters
              </button>
            ) : null}
            <Link href="/profile" className="ctaLink secondaryLink">Check creator profiles</Link>
          </div>
        </div>
      ) : null}

      <div className="listTable">
        {filtered.map((row) => (
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
                <button type="button" className="miniBtn" onClick={() => void submitReport(row)}>
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
    </section>
  );
}
