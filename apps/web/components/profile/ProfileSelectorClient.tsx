"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import {
  fetchCollectionsByOwner,
  fetchProfileDirectory,
  fetchProfilesByOwner,
  type ApiOwnedCollections,
  type ApiProfileRecord
} from "../../lib/indexerApi";

function deriveProfileRouteFromName(fullName: string): string {
  const normalized = String(fullName || "")
    .trim()
    .toLowerCase()
    .replace(/\.+/g, ".")
    .replace(/^\./, "")
    .replace(/\.$/, "");
  if (!normalized) return "";
  if (normalized.endsWith(".nftfactory.eth")) {
    return normalized.replace(/\.nftfactory\.eth$/, "");
  }
  return normalized.split(".").filter(Boolean).reverse().join(".");
}

function normalizeDerivedProfile(collection: ApiOwnedCollections["collections"][number]): ApiProfileRecord | null {
  const rawName = String(collection.ensSubname || "").trim().toLowerCase();
  if (!rawName) return null;
  const fullName = rawName.includes(".") ? rawName : `${rawName}.nftfactory.eth`;
  const slug = deriveProfileRouteFromName(fullName);
  if (!slug) return null;

  return {
    slug,
    fullName,
    source: fullName.endsWith(".nftfactory.eth") ? "nftfactory-subname" : "external-subname",
    ownerAddress: collection.ownerAddress.toLowerCase(),
    collectionAddress: collection.contractAddress.toLowerCase(),
    tagline: null,
    displayName: null,
    bio: null,
    layoutMode: "default",
    aboutMe: null,
    interests: null,
    whoIdLikeToMeet: null,
    statusHeadline: null,
    sidebarFacts: [],
    mediaEmbeds: [],
    retroBlocks: [],
    moduleOrder: ["social", "media", "retro", "boxes", "guestbook", "custom"],
    heroModules: [],
    heroCompactModules: [],
    sidebarModules: [],
    sidebarCompactModules: [],
    mainColumnSplitModules: [],
    mainColumnCompactModules: [],
    topFriends: [],
    stamps: [],
    testimonials: [],
    profileSongUrl: null,
    customBoxes: [],
    bannerUrl: null,
    avatarUrl: null,
    featuredUrl: null,
    accentColor: null,
    customCss: null,
    customHtml: null,
    links: [],
    createdAt: "",
    updatedAt: ""
  };
}

function dedupeProfiles(items: ApiProfileRecord[]): ApiProfileRecord[] {
  const map = new Map<string, ApiProfileRecord>();
  for (const item of items) {
    const key = `${item.slug}:${item.ownerAddress}:${item.source}:${item.collectionAddress || ""}`;
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
}

function createPrimaryProfileKey(address: string): string {
  return `nftfactory:primary-profile:${address.toLowerCase()}`;
}

function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

export default function ProfileSelectorClient() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const [profiles, setProfiles] = useState<ApiProfileRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [note, setNote] = useState("");

  const [directoryProfiles, setDirectoryProfiles] = useState<ApiProfileRecord[]>([]);
  const [directoryTotal, setDirectoryTotal] = useState(0);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState("");
  const [directoryCanLoadMore, setDirectoryCanLoadMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(0);
  const [requestCursor, setRequestCursor] = useState(0);
  const [searchValue, setSearchValue] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | ApiProfileRecord["source"]>("all");
  const [layoutFilter, setLayoutFilter] = useState<"all" | "default" | "myspace">("all");
  const [collectionFilter, setCollectionFilter] = useState<"all" | "with-collection" | "without-collection">("all");
  const [sortFilter, setSortFilter] = useState<"popular" | "name-asc" | "updated-desc" | "created-desc">("popular");
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!address || !isConnected) {
      setProfiles([]);
      setNote("");
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setNote("");
    void Promise.allSettled([fetchProfilesByOwner(address), fetchCollectionsByOwner(address)])
      .then((results) => {
        if (cancelled) return;

        const profileResult = results[0];
        const collectionResult = results[1];

        const linkedProfiles =
          profileResult.status === "fulfilled" ? profileResult.value.profiles || [] : [];
        const derivedProfiles =
          collectionResult.status === "fulfilled"
            ? (collectionResult.value.collections || [])
                .map(normalizeDerivedProfile)
                .filter((item): item is ApiProfileRecord => !!item)
            : [];

        let cachedProfiles: ApiProfileRecord[] = [];
        try {
          const raw = globalThis.localStorage.getItem(createPrimaryProfileKey(address));
          if (raw) {
            const parsed = JSON.parse(raw) as ApiProfileRecord;
            if (parsed?.slug && parsed?.fullName) {
              cachedProfiles = [parsed];
            }
          }
        } catch {
          cachedProfiles = [];
        }

        const nextProfiles = dedupeProfiles([...linkedProfiles, ...derivedProfiles, ...cachedProfiles]);
        setProfiles(nextProfiles);

        if (nextProfiles.length === 0) {
          if (profileResult.status === "rejected" && collectionResult.status === "rejected") {
            const reason =
              profileResult.reason instanceof Error
                ? profileResult.reason.message
                : collectionResult.reason instanceof Error
                  ? collectionResult.reason.message
                  : "Indexer request failed";
            setNote(`Profile lookup is unavailable right now (${reason}). Open setup to continue with manual creator onboarding.`);
            return;
          }
          setNote("No creator profile is linked to this wallet yet. Open setup to link an ENS identity or create an nftfactory.eth subname.");
          return;
        }

        if (profileResult.status === "rejected" && collectionResult.status === "fulfilled") {
          const reason =
            profileResult.reason instanceof Error ? profileResult.reason.message : "Direct profile lookup failed";
          setNote(`Loaded the profile from owned collection data because direct profile lookup failed (${reason}).`);
          return;
        }

        if (
          linkedProfiles.length === 0 &&
          derivedProfiles.length === 0 &&
          cachedProfiles.length > 0
        ) {
          setNote("Showing the most recently linked profile while the indexer catches up.");
          return;
        }

        if (nextProfiles.length > 1) {
          setNote("Multiple creator profiles are linked to this wallet. Redirecting to the primary profile.");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setProfiles([]);
          const reason = err instanceof Error ? err.message : "Indexer request failed";
          setNote(`Profile lookup is unavailable right now (${reason}). Open setup to continue with manual creator onboarding.`);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [address, isConnected]);

  useEffect(() => {
    if (!isConnected || isLoading || profiles.length === 0) return;
    router.replace(`/profile/${encodeURIComponent(profiles[0].slug)}`);
  }, [isConnected, isLoading, profiles, router]);

  const previousFilters = usePrevious(
    `${searchValue}::${sourceFilter}::${layoutFilter}::${collectionFilter}::${sortFilter}`
  );

  useEffect(() => {
    const currentFilters = `${searchValue}::${sourceFilter}::${layoutFilter}::${collectionFilter}::${sortFilter}`;
    if (previousFilters === undefined || previousFilters === currentFilters) return;
    setDirectoryProfiles([]);
    setDirectoryTotal(0);
    setDirectoryCanLoadMore(false);
    setNextCursor(0);
    setRequestCursor(0);
  }, [searchValue, sourceFilter, layoutFilter, collectionFilter, sortFilter, previousFilters]);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      setDirectoryLoading(true);
      setDirectoryError("");
      void fetchProfileDirectory({
        cursor: requestCursor,
        q: searchValue,
        source: sourceFilter,
        layoutMode: layoutFilter,
        hasCollection:
          collectionFilter === "with-collection"
            ? true
            : collectionFilter === "without-collection"
              ? false
              : null,
        sort: sortFilter,
        limit: 24
      })
        .then((response) => {
          if (cancelled) return;
          setDirectoryProfiles((current) => (
            requestCursor === 0 ? response.profiles || [] : [...current, ...(response.profiles || [])]
          ));
          setDirectoryTotal(response.total || 0);
          setDirectoryCanLoadMore(Boolean(response.canLoadMore));
          setNextCursor(response.nextCursor || 0);
        })
        .catch((error) => {
          if (cancelled) return;
          if (requestCursor === 0) {
            setDirectoryProfiles([]);
            setDirectoryTotal(0);
          }
          setDirectoryCanLoadMore(false);
          setDirectoryError(error instanceof Error ? error.message : "Failed to load the public profile directory.");
        })
        .finally(() => {
          if (!cancelled) setDirectoryLoading(false);
        });
    }, requestCursor === 0 ? 250 : 0);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [requestCursor, searchValue, sourceFilter, layoutFilter, collectionFilter, sortFilter]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !directoryCanLoadMore || directoryLoading) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        setRequestCursor((current) => (current === nextCursor ? current : nextCursor));
      }
    }, { rootMargin: "320px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [directoryCanLoadMore, directoryLoading, nextCursor]);

  function loadMoreProfiles(): void {
    if (directoryLoading || !directoryCanLoadMore) return;
    setRequestCursor((current) => (current === nextCursor ? current : nextCursor));
  }

  const linkedProfiles = useMemo(() => profiles.slice(0, 12), [profiles]);
  const shouldShowDirectory = !isConnected || (!isLoading && profiles.length === 0);

  return (
    <section className="wizard">
      <div className="card formCard">
        <h3>Select Profile</h3>
        {!isConnected ? (
          <p className="hint">Connect a wallet from the header to load linked creator profiles.</p>
        ) : isLoading ? (
          <p className="hint">Loading linked profiles...</p>
        ) : linkedProfiles.length > 0 ? (
          <div className="stack">
            <p className="hint">Linked profiles found. Redirecting to the primary profile now.</p>
            {linkedProfiles.map((profile) => (
              <div key={`${profile.slug}:${profile.ownerAddress}:${profile.collectionAddress || ""}`} className="card">
                <strong>{profile.displayName || profile.fullName}</strong>
                <p className="hint">{profile.tagline || profile.fullName}</p>
                <p className="hint">
                  Route: <span className="mono">/profile/{profile.slug}</span>
                </p>
                <div className="row">
                  <Link href={`/profile/${encodeURIComponent(profile.slug)}`} className="ctaLink">
                    Open profile now
                  </Link>
                  {profile.collectionAddress ? (
                    <Link
                      href={`/mint?view=manage&address=${encodeURIComponent(profile.collectionAddress)}`}
                      className="ctaLink secondaryLink"
                    >
                      Manage collection
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="stack">
            <p className="hint">No creator profile is linked to this wallet yet.</p>
            <div className="row">
              <Link href="/profile/setup" className="ctaLink">Create or link profile</Link>
            </div>
          </div>
        )}
        {note ? <p className="hint">{note}</p> : null}
      </div>
      {shouldShowDirectory ? (
        <div className="card formCard">
          <h3>Popular Profiles</h3>
          <p className="hint">
            Browse creator pages directly. The default ordering prioritizes profiles with live collection and storefront activity.
          </p>
          <div className="row">
            <label>
              Search
              <input
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="name, slug, tagline, wallet"
              />
            </label>
            <label>
              Source
              <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as "all" | ApiProfileRecord["source"])}>
                <option value="all">All sources</option>
                <option value="nftfactory-subname">NFTFactory subnames</option>
                <option value="ens">ENS names</option>
                <option value="external-subname">External subnames</option>
              </select>
            </label>
            <label>
              Layout
              <select value={layoutFilter} onChange={(event) => setLayoutFilter(event.target.value as "all" | "default" | "myspace")}>
                <option value="all">All layouts</option>
                <option value="default">Default</option>
                <option value="myspace">Myspace</option>
              </select>
            </label>
            <label>
              Collection
              <select value={collectionFilter} onChange={(event) => setCollectionFilter(event.target.value as "all" | "with-collection" | "without-collection")}>
                <option value="all">All profiles</option>
                <option value="with-collection">With collection</option>
                <option value="without-collection">Without collection</option>
              </select>
            </label>
            <label>
              Order
              <select value={sortFilter} onChange={(event) => setSortFilter(event.target.value as "popular" | "name-asc" | "updated-desc" | "created-desc")}>
                <option value="popular">Popular</option>
                <option value="updated-desc">Recently updated</option>
                <option value="created-desc">Recently created</option>
                <option value="name-asc">Name A-Z</option>
              </select>
            </label>
          </div>
          {directoryLoading && directoryProfiles.length === 0 ? <p className="hint">Loading popular profiles...</p> : null}
          {directoryError ? <p className="hint">{directoryError}</p> : null}
          {!directoryError ? (
            <div className="stack">
              <p className="hint">
                {directoryTotal === 0
                  ? "No profiles match the current filters."
                  : `Showing ${directoryProfiles.length} of ${directoryTotal} matching profiles.`}
              </p>
              {directoryProfiles.map((profile) => (
                <div key={`${profile.slug}:${profile.ownerAddress}:${profile.collectionAddress || ""}:${profile.source}`} className="card">
                  <strong>{profile.displayName || profile.fullName}</strong>
                  <p className="hint">{profile.tagline || profile.fullName}</p>
                  <p className="hint">
                    <span className="mono">/profile/{profile.slug}</span>
                    {" · "}
                    {profile.source}
                    {profile.layoutMode ? ` · ${profile.layoutMode}` : ""}
                  </p>
                  <p className="hint">
                    Owner <span className="mono">{profile.ownerAddress}</span>
                  </p>
                  <div className="row">
                    <Link href={`/profile/${encodeURIComponent(profile.slug)}`} className="ctaLink">
                      Open profile
                    </Link>
                    {profile.collectionAddress ? (
                      <Link
                        href={`/mint?view=manage&address=${encodeURIComponent(profile.collectionAddress)}`}
                        className="ctaLink secondaryLink"
                      >
                        View collection
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))}
              {directoryCanLoadMore ? (
                <div ref={loadMoreRef} className="row">
                  <button type="button" onClick={loadMoreProfiles} disabled={directoryLoading}>
                    {directoryLoading ? "Loading more profiles..." : "Load more profiles"}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
