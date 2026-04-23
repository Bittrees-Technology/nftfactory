"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchMintFeed,
  fetchProfileDirectory,
  type ApiMintFeedItem,
  type ApiProfileRecord
} from "../../lib/indexerApi";

type DiscoverView = "profiles" | "collections" | "nfts";
type ProfileSort = "popular" | "name-asc" | "updated-desc" | "created-desc";
type ProfileSourceFilter = "all" | ApiProfileRecord["source"];
type ProfileCollectionFilter = "all" | "with-collection" | "without-collection";
type StandardFilter = "all" | "ERC-721" | "ERC-1155";
type ListingFilter = "all" | "listed" | "unlisted";
type MediaFilter = "all" | "with-media" | "metadata-only";

type CollectionCard = {
  contractAddress: string;
  ensSubname: string | null;
  standard: string;
  ownerAddress: string;
  tokenSampleCount: number;
  activeListingCount: number;
  latestMintedAt: string;
  isFactoryCreated: boolean;
};

function collectionLabel(item: CollectionCard): string {
  return item.ensSubname || item.contractAddress;
}

function tokenLabel(item: ApiMintFeedItem): string {
  return item.draftName?.trim() || `Token #${item.tokenId}`;
}

function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

export default function DiscoverClient() {
  const [view, setView] = useState<DiscoverView>("profiles");
  const [searchValue, setSearchValue] = useState("");
  const [profileSort, setProfileSort] = useState<ProfileSort>("popular");
  const [profileSourceFilter, setProfileSourceFilter] = useState<ProfileSourceFilter>("all");
  const [profileCollectionFilter, setProfileCollectionFilter] = useState<ProfileCollectionFilter>("all");
  const [collectionStandardFilter, setCollectionStandardFilter] = useState<StandardFilter>("all");
  const [collectionListingFilter, setCollectionListingFilter] = useState<ListingFilter>("all");
  const [nftStandardFilter, setNftStandardFilter] = useState<StandardFilter>("all");
  const [nftListingFilter, setNftListingFilter] = useState<ListingFilter>("all");
  const [nftMediaFilter, setNftMediaFilter] = useState<MediaFilter>("all");

  const [directoryProfiles, setDirectoryProfiles] = useState<ApiProfileRecord[]>([]);
  const [directoryTotal, setDirectoryTotal] = useState(0);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState("");
  const [directoryCanLoadMore, setDirectoryCanLoadMore] = useState(false);
  const [nextProfileCursor, setNextProfileCursor] = useState(0);
  const [profileCursor, setProfileCursor] = useState(0);

  const [feedItems, setFeedItems] = useState<ApiMintFeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState("");
  const [feedCanLoadMore, setFeedCanLoadMore] = useState(false);
  const [nextFeedCursor, setNextFeedCursor] = useState(0);
  const [feedCursor, setFeedCursor] = useState(0);

  const previousProfileFilters = usePrevious(
    `${searchValue}::${profileSort}::${profileSourceFilter}::${profileCollectionFilter}`
  );
  const previousView = usePrevious(view);

  useEffect(() => {
    if (view !== "profiles") return;
    const currentFilters = `${searchValue}::${profileSort}::${profileSourceFilter}::${profileCollectionFilter}`;
    if (previousProfileFilters === undefined || previousProfileFilters === currentFilters) return;
    setDirectoryProfiles([]);
    setDirectoryTotal(0);
    setDirectoryCanLoadMore(false);
    setNextProfileCursor(0);
    setProfileCursor(0);
  }, [profileCollectionFilter, profileSort, profileSourceFilter, previousProfileFilters, searchValue, view]);

  useEffect(() => {
    if (view === "profiles") return;
    if (previousView === view) return;
    if (feedItems.length > 0 || feedLoading) return;
    setFeedCursor(0);
  }, [feedItems.length, feedLoading, previousView, view]);

  useEffect(() => {
    if (view !== "profiles") return;
    let cancelled = false;
    const timeout = setTimeout(() => {
      setDirectoryLoading(true);
      setDirectoryError("");
      void fetchProfileDirectory({
        cursor: profileCursor,
        q: searchValue,
        source: profileSourceFilter,
        layoutMode: "all",
        hasCollection:
          profileCollectionFilter === "with-collection"
            ? true
            : profileCollectionFilter === "without-collection"
              ? false
              : null,
        sort: profileSort,
        limit: 24
      })
        .then((response) => {
          if (cancelled) return;
          setDirectoryProfiles((current) => (
            profileCursor === 0 ? response.profiles || [] : [...current, ...(response.profiles || [])]
          ));
          setDirectoryTotal(response.total || 0);
          setDirectoryCanLoadMore(Boolean(response.canLoadMore));
          setNextProfileCursor(response.nextCursor || 0);
        })
        .catch((error) => {
          if (cancelled) return;
          if (profileCursor === 0) {
            setDirectoryProfiles([]);
            setDirectoryTotal(0);
          }
          setDirectoryCanLoadMore(false);
          setDirectoryError(error instanceof Error ? error.message : "Failed to load discover profiles.");
        })
        .finally(() => {
          if (!cancelled) setDirectoryLoading(false);
        });
    }, profileCursor === 0 ? 200 : 0);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [profileCollectionFilter, profileCursor, profileSort, profileSourceFilter, searchValue, view]);

  useEffect(() => {
    if (view === "profiles") return;
    let cancelled = false;
    setFeedLoading(true);
    setFeedError("");
    void fetchMintFeed(feedCursor, 48)
      .then((response) => {
        if (cancelled) return;
        setFeedItems((current) => (
          feedCursor === 0 ? response.items || [] : [...current, ...(response.items || [])]
        ));
        setFeedCanLoadMore(Boolean(response.canLoadMore));
        setNextFeedCursor(response.nextCursor || 0);
      })
      .catch((error) => {
        if (cancelled) return;
        if (feedCursor === 0) {
          setFeedItems([]);
        }
        setFeedCanLoadMore(false);
        setFeedError(error instanceof Error ? error.message : "Failed to load discover feed.");
      })
      .finally(() => {
        if (!cancelled) setFeedLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [feedCursor, view]);

  const searchedFeedItems = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    if (!query) return feedItems;
    return feedItems.filter((item) => {
      const haystack = [
        item.draftName,
        item.draftDescription,
        item.tokenId,
        item.creatorAddress,
        item.ownerAddress,
        item.collection.ensSubname,
        item.collection.contractAddress,
        item.collection.standard
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [feedItems, searchValue]);

  const collectionCards = useMemo(() => {
    const byContract = new Map<string, CollectionCard>();
    for (const item of searchedFeedItems) {
      const contract = item.collection.contractAddress.toLowerCase();
      const existing = byContract.get(contract);
      if (existing) {
        existing.tokenSampleCount += 1;
        if (item.activeListing) existing.activeListingCount += 1;
        if (new Date(item.mintedAt).getTime() > new Date(existing.latestMintedAt).getTime()) {
          existing.latestMintedAt = item.mintedAt;
        }
        continue;
      }
      byContract.set(contract, {
        contractAddress: item.collection.contractAddress,
        ensSubname: item.collection.ensSubname,
        standard: item.collection.standard,
        ownerAddress: item.collection.ownerAddress,
        tokenSampleCount: 1,
        activeListingCount: item.activeListing ? 1 : 0,
        latestMintedAt: item.mintedAt,
        isFactoryCreated: item.collection.isFactoryCreated
      });
    }
    return [...byContract.values()].sort((left, right) => (
      new Date(right.latestMintedAt).getTime() - new Date(left.latestMintedAt).getTime()
    ));
  }, [searchedFeedItems]);

  const filteredCollectionCards = useMemo(() => {
    return collectionCards.filter((item) => {
      if (collectionStandardFilter !== "all" && item.standard !== collectionStandardFilter) return false;
      if (collectionListingFilter === "listed" && item.activeListingCount === 0) return false;
      if (collectionListingFilter === "unlisted" && item.activeListingCount > 0) return false;
      return true;
    });
  }, [collectionCards, collectionListingFilter, collectionStandardFilter]);

  const filteredNftItems = useMemo(() => {
    return searchedFeedItems.filter((item) => {
      if (nftStandardFilter !== "all" && item.collection.standard !== nftStandardFilter) return false;
      if (nftListingFilter === "listed" && !item.activeListing) return false;
      if (nftListingFilter === "unlisted" && item.activeListing) return false;
      if (nftMediaFilter === "with-media" && !item.mediaUrl) return false;
      if (nftMediaFilter === "metadata-only" && item.mediaUrl) return false;
      return true;
    });
  }, [nftListingFilter, nftMediaFilter, nftStandardFilter, searchedFeedItems]);

  function loadMoreProfiles(): void {
    if (directoryLoading || !directoryCanLoadMore) return;
    setProfileCursor((current) => (current === nextProfileCursor ? current : nextProfileCursor));
  }

  function loadMoreFeed(): void {
    if (feedLoading || !feedCanLoadMore) return;
    setFeedCursor((current) => (current === nextFeedCursor ? current : nextFeedCursor));
  }

  return (
    <section className="wizard discoverPage">
      <section className="card formCard discoverHero">
        <div className="discoverHeroCopy">
          <p className="eyebrow">Discover</p>
          <h2>Browse NFTFactory profiles, collection contracts, and live NFTs from one public index.</h2>
          <p className="sectionLead">
            This route stays scoped to NFTFactory identity records and NFTFactory-related collections so public browsing does not have to start inside the creator portal.
          </p>
        </div>
      </section>

      <section className="card formCard discoverPanel">
        <div className="discoverToolbar">
          <div className="discoverTabs" role="tablist" aria-label="Discover views">
            <button type="button" className={view === "profiles" ? "discoverTab discoverTabActive" : "discoverTab"} onClick={() => setView("profiles")}>
              Profiles
            </button>
            <button type="button" className={view === "collections" ? "discoverTab discoverTabActive" : "discoverTab"} onClick={() => setView("collections")}>
              Collections
            </button>
            <button type="button" className={view === "nfts" ? "discoverTab discoverTabActive" : "discoverTab"} onClick={() => setView("nfts")}>
              NFTs
            </button>
          </div>
          <div className="discoverToolbarActions">
            <label>
              Search
              <input
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder={view === "profiles" ? "name, slug, tagline, wallet" : "name, contract, token, wallet"}
              />
            </label>
            {view === "profiles" ? (
              <>
                <label>
                  Source
                  <select
                    value={profileSourceFilter}
                    onChange={(event) => setProfileSourceFilter(event.target.value as ProfileSourceFilter)}
                  >
                    <option value="all">All profiles</option>
                    <option value="nftfactory-subname">NFTFactory subnames</option>
                    <option value="ens">ENS names</option>
                    <option value="external-subname">External subnames</option>
                  </select>
                </label>
                <label>
                  Collection
                  <select
                    value={profileCollectionFilter}
                    onChange={(event) => setProfileCollectionFilter(event.target.value as ProfileCollectionFilter)}
                  >
                    <option value="all">All profiles</option>
                    <option value="with-collection">With collection</option>
                    <option value="without-collection">Without collection</option>
                  </select>
                </label>
                <label>
                  Order
                  <select value={profileSort} onChange={(event) => setProfileSort(event.target.value as ProfileSort)}>
                    <option value="popular">Popular</option>
                    <option value="updated-desc">Recently updated</option>
                    <option value="created-desc">Recently created</option>
                    <option value="name-asc">Name A-Z</option>
                  </select>
                </label>
              </>
            ) : null}
            {view === "collections" ? (
              <>
                <label>
                  Standard
                  <select
                    value={collectionStandardFilter}
                    onChange={(event) => setCollectionStandardFilter(event.target.value as StandardFilter)}
                  >
                    <option value="all">All standards</option>
                    <option value="ERC-721">ERC-721</option>
                    <option value="ERC-1155">ERC-1155</option>
                  </select>
                </label>
                <label>
                  Listings
                  <select
                    value={collectionListingFilter}
                    onChange={(event) => setCollectionListingFilter(event.target.value as ListingFilter)}
                  >
                    <option value="all">All collections</option>
                    <option value="listed">Listed only</option>
                    <option value="unlisted">Unlisted only</option>
                  </select>
                </label>
              </>
            ) : null}
            {view === "nfts" ? (
              <>
                <label>
                  Standard
                  <select
                    value={nftStandardFilter}
                    onChange={(event) => setNftStandardFilter(event.target.value as StandardFilter)}
                  >
                    <option value="all">All standards</option>
                    <option value="ERC-721">ERC-721</option>
                    <option value="ERC-1155">ERC-1155</option>
                  </select>
                </label>
                <label>
                  Listings
                  <select
                    value={nftListingFilter}
                    onChange={(event) => setNftListingFilter(event.target.value as ListingFilter)}
                  >
                    <option value="all">All NFTs</option>
                    <option value="listed">Listed only</option>
                    <option value="unlisted">Unlisted only</option>
                  </select>
                </label>
                <label>
                  Media
                  <select
                    value={nftMediaFilter}
                    onChange={(event) => setNftMediaFilter(event.target.value as MediaFilter)}
                  >
                    <option value="all">All media states</option>
                    <option value="with-media">With media</option>
                    <option value="metadata-only">Metadata only</option>
                  </select>
                </label>
              </>
            ) : null}
          </div>
        </div>

        {view === "profiles" ? (
          <div className="stack discoverStack">
            {directoryLoading && directoryProfiles.length === 0 ? <p className="hint">Loading profiles...</p> : null}
            {directoryError ? <p className="hint">{directoryError}</p> : null}
            {!directoryError ? (
              <>
                <p className="hint">
                  {directoryTotal === 0
                    ? "No profiles match the current filters."
                    : `Showing ${directoryProfiles.length} of ${directoryTotal} matching profiles.`}
                </p>
                <div className="profileDirectoryGrid">
                  {directoryProfiles.map((profile) => (
                    <div key={`${profile.slug}:${profile.ownerAddress}:${profile.collectionAddress || ""}:${profile.source}`} className="card profileDirectoryProfileCard">
                      <strong>{profile.displayName || profile.fullName}</strong>
                      <p className="hint">{profile.tagline || profile.fullName}</p>
                      <div className="profileChipRow">
                        <span className="profileChip">{profile.source}</span>
                        {profile.collectionAddress ? <span className="profileChip">with collection</span> : null}
                        {profile.layoutMode ? <span className="profileChip">{profile.layoutMode} layout</span> : null}
                      </div>
                      <div className="profileSelectorMetaGrid">
                        <p className="hint"><span className="mono">/profile/{profile.slug}</span></p>
                        <p className="hint">Owner <span className="mono">{profile.ownerAddress}</span></p>
                      </div>
                      <div className="row profileSelectorActions">
                        <Link href={`/profile/${encodeURIComponent(profile.slug)}`} className="ctaLink">
                          Open profile
                        </Link>
                        {profile.collectionAddress ? (
                          <Link href={`/mint?view=manage&address=${encodeURIComponent(profile.collectionAddress)}`} className="ctaLink secondaryLink">
                            Manage collection
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
                {directoryCanLoadMore ? (
                  <div className="row profileSelectorActions">
                    <button type="button" onClick={loadMoreProfiles} disabled={directoryLoading}>
                      {directoryLoading ? "Loading more profiles..." : "Load more profiles"}
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}

        {view === "collections" ? (
          <div className="stack discoverStack">
            {feedLoading && feedItems.length === 0 ? <p className="hint">Loading collections...</p> : null}
            {feedError ? <p className="hint">{feedError}</p> : null}
            {!feedError ? (
              <>
                <p className="hint">
                  {filteredCollectionCards.length === 0
                    ? "No collections match the current filters."
                    : `Showing ${filteredCollectionCards.length} NFTFactory-related collection contracts from the public mint feed.`}
                </p>
                <div className="profileDirectoryGrid">
                  {filteredCollectionCards.map((item) => (
                    <div key={item.contractAddress} className="card profileDirectoryProfileCard">
                      <strong>{collectionLabel(item)}</strong>
                      <div className="profileChipRow">
                        <span className="profileChip">{item.standard}</span>
                        <span className="profileChip">{item.isFactoryCreated ? "factory" : "external"}</span>
                        {item.activeListingCount > 0 ? <span className="profileChip">{item.activeListingCount} listings</span> : null}
                        <span className="profileChip">{item.tokenSampleCount} tokens</span>
                      </div>
                      <div className="profileSelectorMetaGrid">
                        <p className="hint"><span className="mono">{item.contractAddress}</span></p>
                        <p className="hint">Owner <span className="mono">{item.ownerAddress}</span></p>
                      </div>
                      <p className="hint">Latest mint {new Date(item.latestMintedAt).toLocaleString()}</p>
                      <div className="row profileSelectorActions">
                        <Link href={`/mint?view=view&address=${encodeURIComponent(item.contractAddress)}`} className="ctaLink">
                          View collection
                        </Link>
                        <Link href={`/mint?view=manage&address=${encodeURIComponent(item.contractAddress)}`} className="ctaLink secondaryLink">
                          Manage collection
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
                {feedCanLoadMore ? (
                  <div className="row profileSelectorActions">
                    <button type="button" onClick={loadMoreFeed} disabled={feedLoading}>
                      {feedLoading ? "Loading more collections..." : "Load more collections"}
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}

        {view === "nfts" ? (
          <div className="stack discoverStack">
            {feedLoading && feedItems.length === 0 ? <p className="hint">Loading NFTs...</p> : null}
            {feedError ? <p className="hint">{feedError}</p> : null}
            {!feedError ? (
              <>
                <p className="hint">
                  {filteredNftItems.length === 0
                    ? "No NFTs match the current filters."
                    : `Showing ${filteredNftItems.length} NFTs from NFTFactory-related collections.`}
                </p>
                <div className="discoverGrid">
                  {filteredNftItems.map((item) => (
                    <div key={item.id} className="card discoverCard">
                      <strong>{tokenLabel(item)}</strong>
                      <p className="hint">{item.collection.ensSubname || item.collection.contractAddress}</p>
                      <div className="profileChipRow">
                        <span className="profileChip">{item.collection.standard}</span>
                        <span className="profileChip">{item.collection.isFactoryCreated ? "factory" : "external"}</span>
                        <span className="profileChip">Token #{item.tokenId}</span>
                        {item.activeListing ? <span className="profileChip">listed</span> : null}
                        {!item.mediaUrl ? <span className="profileChip">metadata only</span> : null}
                      </div>
                      <div className="profileSelectorMetaGrid">
                        <p className="hint">Creator <span className="mono">{item.creatorAddress}</span></p>
                        <p className="hint">Owner <span className="mono">{item.ownerAddress}</span></p>
                      </div>
                      <p className="hint">Minted {new Date(item.mintedAt).toLocaleString()}</p>
                      <div className="row profileSelectorActions">
                        <Link href={`/mint?view=view&address=${encodeURIComponent(item.collection.contractAddress)}`} className="ctaLink">
                          View collection
                        </Link>
                        {item.metadataUrl ? (
                          <a href={item.metadataUrl} target="_blank" rel="noreferrer" className="ctaLink secondaryLink">
                            Metadata
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
                {feedCanLoadMore ? (
                  <div className="row profileSelectorActions">
                    <button type="button" onClick={loadMoreFeed} disabled={feedLoading}>
                      {feedLoading ? "Loading more NFTs..." : "Load more NFTs"}
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
      </section>
    </section>
  );
}
