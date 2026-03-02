"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Address } from "viem";
import { useAccount } from "wagmi";
import { getContractsConfig } from "../../../lib/contracts";
import {
  fetchActiveListingsBatch,
  formatListingPrice,
  toExplorerAddress,
  truncateAddress,
  type MarketplaceListing
} from "../../../lib/marketplace";
import { fetchHiddenListingIds, fetchProfileResolution, linkProfileIdentity, type ApiProfileResolution } from "../../../lib/indexerApi";

function isAddress(value: string): value is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function getFeaturedMediaKind(url: string | null | undefined): "image" | "audio" | "video" | "link" | null {
  if (!url) return null;
  const normalized = url.trim().toLowerCase();
  if (!normalized) return null;
  if (/\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/.test(normalized)) return "image";
  if (/\.(mp3|wav|ogg|m4a|flac)(\?|#|$)/.test(normalized)) return "audio";
  if (/\.(mp4|webm|mov)(\?|#|$)/.test(normalized) || normalized.includes("youtube.com") || normalized.includes("youtu.be")) {
    return "video";
  }
  return "link";
}

export default function ProfileClient({ name }: { name: string }) {
  const config = useMemo(() => getContractsConfig(), []);
  const { address: connectedAddress, isConnected } = useAccount();
  const canonicalRoute = `/profile/${name}`;

  const [sellerAddress, setSellerAddress] = useState("");
  const [scanDepth, setScanDepth] = useState("250");
  const [allListings, setAllListings] = useState<MarketplaceListing[]>([]);
  const [hiddenListingIds, setHiddenListingIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [indexerError, setIndexerError] = useState("");
  const [profileResolution, setProfileResolution] = useState<ApiProfileResolution | null>(null);
  const [editTagline, setEditTagline] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editBannerUrl, setEditBannerUrl] = useState("");
  const [editAvatarUrl, setEditAvatarUrl] = useState("");
  const [editFeaturedUrl, setEditFeaturedUrl] = useState("");
  const [editAccentColor, setEditAccentColor] = useState("#c53a1f");
  const [editLinksText, setEditLinksText] = useState("");
  const [editState, setEditState] = useState<{ status: "idle" | "pending" | "success" | "error"; message?: string }>({
    status: "idle"
  });

  const loadListings = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError("");
    try {
      const parsedDepth = Number.parseInt(scanDepth, 10);
      const limit = Number.isInteger(parsedDepth) && parsedDepth > 0 ? parsedDepth : 250;
      const result = await fetchActiveListingsBatch({
        chainId: config.chainId,
        rpcUrl: config.rpcUrl,
        marketplace: config.marketplace as Address,
        cursor: null,
        limit
      });
      setAllListings(result.listings);
      try {
        setHiddenListingIds(await fetchHiddenListingIds());
      } catch {
        setHiddenListingIds([]);
        setIndexerError("Indexer moderation filters are unavailable, so hidden-list filtering is currently disabled.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load creator data.");
    } finally {
      setIsLoading(false);
    }
  }, [config.marketplace, config.rpcUrl, scanDepth]);

  useEffect(() => {
    void loadListings();
  }, [loadListings]);

  useEffect(() => {
    const run = async (): Promise<void> => {
      try {
        setIndexerError("");
        const resolution = await fetchProfileResolution(name);
        setProfileResolution(resolution);
        const resolvedSeller = resolution.sellers.find((item) => isAddress(item));
        if (!sellerAddress && resolvedSeller && isAddress(resolvedSeller)) {
          setSellerAddress(resolvedSeller);
        }
        if (resolvedSeller && isAddress(resolvedSeller)) {
          setResolutionNote(
            resolution.collections.length > 0
              ? `Resolved from indexer profile mapping (${resolution.name}) with ${resolution.collections.length} indexed collection${resolution.collections.length === 1 ? "" : "s"}.`
              : `Resolved from indexer profile mapping (${resolution.name}).`
          );
        } else {
          setProfileResolution(resolution);
          setResolutionNote("No backend mapping found yet. Enter wallet manually.");
        }
      } catch {
        setProfileResolution(null);
        setIndexerError("Profile resolution is unavailable right now. Manual wallet lookup still works.");
        setResolutionNote("Profile resolution unavailable. Enter wallet manually.");
      }
    };
    void run();
  }, [name, sellerAddress]);

  const resolvedSellerAddresses = useMemo(
    () => (profileResolution?.sellers || []).filter((item): item is Address => isAddress(item)),
    [profileResolution]
  );

  const linkedProfiles = useMemo(() => profileResolution?.profiles || [], [profileResolution]);
  const primaryProfile = useMemo(() => linkedProfiles[0] || null, [linkedProfiles]);
  const canEditProfile = useMemo(() => {
    if (!isConnected || !connectedAddress || !primaryProfile) return false;
    return connectedAddress.toLowerCase() === primaryProfile.ownerAddress.toLowerCase();
  }, [connectedAddress, isConnected, primaryProfile]);

  const primaryProfileName = useMemo(() => {
    const linked = primaryProfile?.fullName?.trim();
    if (linked) return linked;
    const collectionName = profileResolution?.collections?.find((item) => item.ensSubname?.trim())?.ensSubname?.trim();
    if (collectionName) {
      return collectionName.includes(".") ? collectionName : `${collectionName}.nftfactory.eth`;
    }
    return `${name}.nftfactory.eth`;
  }, [name, primaryProfile, profileResolution]);

  const mintProfileParam = useMemo(() => {
    const linked = primaryProfile?.fullName?.trim();
    if (linked) return linked;
    return primaryProfileName;
  }, [primaryProfile, primaryProfileName]);

  const creatorDisplayName = useMemo(() => primaryProfile?.displayName?.trim() || primaryProfileName, [primaryProfile, primaryProfileName]);
  const creatorTagline = useMemo(() => primaryProfile?.tagline?.trim() || "A creator page built around ENS identity, drops, and live storefront activity.", [primaryProfile]);
  const creatorBio = useMemo(
    () =>
      primaryProfile?.bio?.trim() ||
      "This creator page blends linked ENS identity, collections, and live listings into one storefront view.",
    [primaryProfile]
  );
  const heroStyle = useMemo(
    () =>
      primaryProfile?.accentColor
        ? {
            borderColor: primaryProfile.accentColor
          }
        : undefined,
    [primaryProfile]
  );

  const activeSellerAddresses = useMemo(() => {
    if (isAddress(sellerAddress)) return [sellerAddress.toLowerCase()];
    return resolvedSellerAddresses.map((item) => item.toLowerCase());
  }, [resolvedSellerAddresses, sellerAddress]);

  const creatorListings = useMemo(() => {
    if (activeSellerAddresses.length === 0) return [];
    const hidden = new Set(hiddenListingIds);
    return allListings.filter(
      (listing) => activeSellerAddresses.includes(listing.seller.toLowerCase()) && !hidden.has(listing.id)
    );
  }, [activeSellerAddresses, allListings, hiddenListingIds]);

  const collectionSummaries = useMemo(() => {
    const listingCounts = new Map<string, number>();
    for (const listing of creatorListings) {
      const key = listing.nft.toLowerCase();
      listingCounts.set(key, (listingCounts.get(key) || 0) + 1);
    }

    return (profileResolution?.collections || []).map((item) => ({
      ...item,
      activeListings: listingCounts.get(item.contractAddress.toLowerCase()) || 0
    }));
  }, [creatorListings, profileResolution]);

  const pinnedCollection = useMemo(() => {
    const pinnedAddress = primaryProfile?.collectionAddress?.toLowerCase();
    if (pinnedAddress) {
      const match = collectionSummaries.find((item) => item.contractAddress.toLowerCase() === pinnedAddress);
      if (match) return match;
    }
    return collectionSummaries[0] || null;
  }, [collectionSummaries, primaryProfile]);

  const stats = useMemo(() => {
    if (creatorListings.length === 0) {
      return {
        listings: 0,
        uniqueCollections: collectionSummaries.length,
        floorPrice: "-",
        resolvedWallets: resolvedSellerAddresses.length
      };
    }

    const collections = new Set(creatorListings.map((item) => item.nft.toLowerCase()));

    // Floor price: find the lowest-priced ETH listing so formatting is always correct.
    const ethListings = creatorListings.filter((item) => item.paymentToken === "0x0000000000000000000000000000000000000000");
    const floorListing = ethListings.length > 0
      ? ethListings.reduce((min, item) => (item.price < min.price ? item : min), ethListings[0])
      : null;

    return {
      listings: creatorListings.length,
      uniqueCollections: collections.size,
      floorPrice: floorListing ? formatListingPrice(floorListing) : "ERC20 only",
      resolvedWallets: resolvedSellerAddresses.length
    };
  }, [collectionSummaries.length, creatorListings, resolvedSellerAddresses.length]);

  const featuredListing = useMemo(() => {
    if (creatorListings.length === 0) return null;
    const ethListings = creatorListings.filter((item) => item.paymentToken === "0x0000000000000000000000000000000000000000");
    if (ethListings.length > 0) {
      return ethListings.reduce((min, item) => (item.price < min.price ? item : min), ethListings[0]);
    }
    return creatorListings[0];
  }, [creatorListings]);

  const hasResolvedIdentity = resolvedSellerAddresses.length > 0;
  const hasManualWallet = Boolean(sellerAddress.trim());
  const hasProfileData = hasResolvedIdentity || hasManualWallet;
  const featuredMediaKind = useMemo(() => getFeaturedMediaKind(primaryProfile?.featuredUrl), [primaryProfile]);

  useEffect(() => {
    if (!primaryProfile) return;
    setEditTagline(primaryProfile.tagline || "");
    setEditDisplayName(primaryProfile.displayName || "");
    setEditBio(primaryProfile.bio || "");
    setEditBannerUrl(primaryProfile.bannerUrl || "");
    setEditAvatarUrl(primaryProfile.avatarUrl || "");
    setEditFeaturedUrl(primaryProfile.featuredUrl || "");
    setEditAccentColor(primaryProfile.accentColor || "#c53a1f");
    setEditLinksText((primaryProfile.links || []).join("\n"));
    setEditState({ status: "idle" });
  }, [primaryProfile]);

  async function saveProfileDetails(): Promise<void> {
    if (!primaryProfile) {
      setEditState({ status: "error", message: "No linked profile is available to edit yet." });
      return;
    }
    if (!canEditProfile) {
      setEditState({ status: "error", message: "Connect the profile owner wallet to edit these details." });
      return;
    }

    try {
      setEditState({ status: "pending", message: "Saving profile details..." });
      const response = await linkProfileIdentity({
        name: primaryProfile.fullName,
        source: primaryProfile.source,
        ownerAddress: primaryProfile.ownerAddress,
        collectionAddress: primaryProfile.collectionAddress || undefined,
        tagline: editTagline,
        displayName: editDisplayName,
        bio: editBio,
        bannerUrl: editBannerUrl,
        avatarUrl: editAvatarUrl,
        featuredUrl: editFeaturedUrl,
        accentColor: editAccentColor,
        links: editLinksText.split("\n").map((item) => item.trim()).filter(Boolean)
      });

      setProfileResolution((current) => {
        if (!current) return current;
        const nextProfiles = [response.profile, ...(current.profiles || []).filter((item) => item.slug !== response.profile.slug)];
        return { ...current, profiles: nextProfiles };
      });
      setEditState({ status: "success", message: "Profile details saved." });
    } catch (err) {
      setEditState({
        status: "error",
        message: err instanceof Error ? err.message : "Failed to save profile details"
      });
    }
  }

  return (
    <section className="wizard">
      <div className="profileShell">
        <section className="card profileIdentityCard">
          <p className="eyebrow">Profile Card</p>
          <div className="profileBannerShell" style={heroStyle}>
            {primaryProfile?.bannerUrl ? (
              <div className="profileBannerFrame">
                <img src={primaryProfile.bannerUrl} alt={`${creatorDisplayName} banner`} className="profileBannerImage" />
              </div>
            ) : null}
            <p className="hint">{primaryProfileName}</p>
          </div>
          <div className="profileIdentityHead">
            {primaryProfile?.avatarUrl ? (
              <img src={primaryProfile.avatarUrl} alt={`${creatorDisplayName} avatar`} className="profileAvatarImage" />
            ) : (
              <div className="profileAvatarFallback">{creatorDisplayName.slice(0, 1).toUpperCase()}</div>
            )}
            <div className="profileIdentityMeta">
              <h3>{creatorDisplayName}</h3>
              <p className="hint">{primaryProfileName}</p>
              <p className="hint">
                Route: <span className="mono">{canonicalRoute}</span>
              </p>
            </div>
          </div>
          <p className="sectionLead">
            {hasResolvedIdentity
              ? "This creator identity is linked and ready for storefront traffic."
              : "This creator route is partially set up and still needs a stronger identity link."}
          </p>
          <p className="hint">{creatorTagline}</p>
          <div className="profileChipRow">
            <span className="profileChip">{hasResolvedIdentity ? "Linked" : "Unresolved"}</span>
            <span className="profileChip">{stats.resolvedWallets} wallet{stats.resolvedWallets === 1 ? "" : "s"}</span>
            <span className="profileChip">{stats.uniqueCollections} collection{stats.uniqueCollections === 1 ? "" : "s"}</span>
            <span className="profileChip">{stats.listings} live listing{stats.listings === 1 ? "" : "s"}</span>
          </div>
          {linkedProfiles.length > 0 ? (
            <div className="compactList">
              {linkedProfiles.map((profile) => (
                <div key={`${profile.slug}-${profile.source}-${profile.collectionAddress || "none"}`} className="profileIdentityRow">
                  <strong>{profile.fullName}</strong>
                  <span className="hint">{profile.source === "nftfactory-subname" ? "nftfactory subname" : profile.source === "external-subname" ? "linked subdomain" : "linked ENS"}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="hint">No linked identity records were returned. This page is relying on collection ownership or manual wallet resolution.</p>
          )}
        </section>

        <section className="card profileFeatureCard">
          <p className="eyebrow">Featured Drop</p>
          {primaryProfile?.featuredUrl ? (
            <div className="profileFeatureMedia">
              {featuredMediaKind === "image" ? (
                <img src={primaryProfile.featuredUrl} alt={`${creatorDisplayName} featured media`} className="profileFeatureImage" />
              ) : null}
              {featuredMediaKind === "audio" ? (
                <audio controls preload="none" className="profileFeatureAudio">
                  <source src={primaryProfile.featuredUrl} />
                </audio>
              ) : null}
              {featuredMediaKind === "video" ? (
                <div className="profileFeatureEmbed">
                  <a href={primaryProfile.featuredUrl} target="_blank" rel="noreferrer" className="ctaLink secondaryLink">
                    Open featured video
                  </a>
                </div>
              ) : null}
              {featuredMediaKind === "link" ? (
                <a href={primaryProfile.featuredUrl} target="_blank" rel="noreferrer" className="ctaLink secondaryLink">
                  Open featured media
                </a>
              ) : null}
            </div>
          ) : null}
          {featuredListing ? (
            <>
              <h3>Listing #{featuredListing.id}</h3>
              <p className="sectionLead">
                {featuredListing.standard} token #{featuredListing.tokenId.toString()} listed for {formatListingPrice(featuredListing)}.
              </p>
              <div className="detailGrid">
                <div className="detailItem">
                  <span className="detailLabel">Collection</span>
                  <p className="detailValue mono">{truncateAddress(featuredListing.nft)}</p>
                </div>
                <div className="detailItem">
                  <span className="detailLabel">Seller</span>
                  <p className="detailValue mono">{truncateAddress(featuredListing.seller)}</p>
                </div>
                <div className="detailItem">
                  <span className="detailLabel">Amount</span>
                  <p className="detailValue">{featuredListing.amount.toString()}</p>
                </div>
                <div className="detailItem">
                  <span className="detailLabel">Pricing</span>
                  <p className="detailValue">{featuredListing.paymentToken === "0x0000000000000000000000000000000000000000" ? "ETH" : "ERC-20"}</p>
                </div>
              </div>
            </>
          ) : (
            <>
              <h3>No Featured Listing Yet</h3>
              <p className="sectionLead">
                This creator page does not have a live listing to spotlight yet. Mint and list under this identity to give the storefront something to feature.
              </p>
              <div className="row">
                <Link href={`/mint?view=mint&collection=shared&profile=${encodeURIComponent(mintProfileParam)}`} className="ctaLink secondaryLink">Mint from this profile</Link>
                <Link href="/list" className="ctaLink secondaryLink">Create a listing</Link>
              </div>
            </>
          )}
        </section>
      </div>

      <div className="profileShell">
        <section className="card profileFeatureCard">
          <p className="eyebrow">About</p>
          <h3>Creator Wall</h3>
          <p className="sectionLead">{creatorBio}</p>
          <div className="detailGrid">
            <div className="detailItem">
              <span className="detailLabel">Primary Route</span>
              <p className="detailValue mono">/profile/{name}</p>
            </div>
            <div className="detailItem">
              <span className="detailLabel">Identity Count</span>
              <p className="detailValue">{linkedProfiles.length}</p>
            </div>
            <div className="detailItem">
              <span className="detailLabel">Live Listings</span>
              <p className="detailValue">{stats.listings}</p>
            </div>
            <div className="detailItem">
              <span className="detailLabel">Collections</span>
              <p className="detailValue">{stats.uniqueCollections}</p>
            </div>
          </div>
        </section>

        <section className="card profileIdentityCard">
          <p className="eyebrow">Links</p>
          <h3>Elsewhere</h3>
          {primaryProfile?.links?.length ? (
            <div className="compactList">
              {primaryProfile.links.map((link) => (
                <a key={link} href={link} target="_blank" rel="noreferrer" className="profileLinkRow">
                  {link}
                </a>
              ))}
            </div>
          ) : (
            <p className="hint">No external links are pinned to this creator page yet.</p>
          )}
        </section>
      </div>

      <div className="card formCard">
        <h3>Pinned Collection</h3>
        {pinnedCollection ? (
          <>
            <p className="sectionLead">
              {pinnedCollection.ensSubname?.trim()
                ? `${pinnedCollection.ensSubname}${pinnedCollection.ensSubname.includes(".") ? "" : ".nftfactory.eth"}`
                : "Primary creator collection"}
            </p>
            <div className="detailGrid">
              <div className="detailItem">
                <span className="detailLabel">Contract</span>
                {toExplorerAddress(pinnedCollection.contractAddress, config.chainId) ? (
                  <a href={toExplorerAddress(pinnedCollection.contractAddress, config.chainId)!} target="_blank" rel="noreferrer" className="detailValue mono">
                    {pinnedCollection.contractAddress}
                  </a>
                ) : (
                  <p className="detailValue mono">{pinnedCollection.contractAddress}</p>
                )}
              </div>
              <div className="detailItem">
                <span className="detailLabel">Owner</span>
                <p className="detailValue mono">{truncateAddress(pinnedCollection.ownerAddress)}</p>
              </div>
              <div className="detailItem">
                <span className="detailLabel">Live Listings</span>
                <p className="detailValue">{pinnedCollection.activeListings}</p>
              </div>
            </div>
          </>
        ) : (
          <p className="hint">No creator collection is pinned yet. Link a collection during profile setup to feature it here.</p>
        )}
      </div>

      <div className="card formCard">
        <h3>View Controls</h3>
        <div className="gridMini">
          <label>
            Creator wallet address
            <input
              value={sellerAddress}
              onChange={(e) => setSellerAddress(e.target.value.trim())}
              placeholder="0xcreator..."
            />
          </label>
          <label>
            Scan depth
            <input value={scanDepth} onChange={(e) => setScanDepth(e.target.value)} inputMode="numeric" placeholder="250" />
          </label>
        </div>
        <div className="row">
          <button type="button" onClick={() => void loadListings()} disabled={isLoading}>
            {isLoading ? "Loading..." : "Refresh Profile"}
          </button>
          <Link href="/discover" className="ctaLink secondaryLink">Browse all listings</Link>
        </div>
        {activeSellerAddresses.length === 0 ? (
          <p className="hint">Enter a valid creator wallet address or rely on ENS resolution to populate this profile.</p>
        ) : null}
        {resolutionNote ? <p className="hint">{resolutionNote}</p> : null}
        {indexerError ? <p className="error">{indexerError}</p> : null}
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="grid">
        <article className="card">
          <h3>Identity Source</h3>
          <p>{hasResolvedIdentity ? "Indexer + ENS" : hasManualWallet ? "Manual wallet" : "Unresolved"}</p>
        </article>
        <article className="card">
          <h3>Profile State</h3>
          <p>{hasProfileData ? "Ready to inspect" : "Needs lookup"}</p>
        </article>
      </div>

      {!hasProfileData ? (
        <div className="card formCard">
          <h3>Profile Needs A Wallet Mapping</h3>
          <p className="hint">
            This route can only show storefront activity after the ENS label resolves to one or more wallet
            addresses, or after you enter a creator wallet manually above.
          </p>
          <div className="row">
            <Link href={`/profile/setup?label=${encodeURIComponent(name)}`} className="ctaLink secondaryLink">Open creator setup</Link>
            <Link href={`/mint?view=mint&collection=shared&profile=${encodeURIComponent(mintProfileParam)}`} className="ctaLink secondaryLink">Mint with this ENS</Link>
            <Link href="/discover" className="ctaLink secondaryLink">Browse all listings</Link>
          </div>
        </div>
      ) : null}

      {!hasResolvedIdentity ? (
        <div className="card formCard">
          <h3>Identity Setup</h3>
          <p className="sectionLead">
            If this creator label is still new, finish profile setup first: link an ENS identity or create
            an nftfactory.eth subname, then publish so the storefront can resolve automatically.
          </p>
          <div className="row">
            <Link href={`/profile/setup?label=${encodeURIComponent(name)}`} className="ctaLink secondaryLink">Open setup</Link>
            <Link href={`/mint?view=mint&collection=shared&profile=${encodeURIComponent(mintProfileParam)}`} className="ctaLink secondaryLink">Launch ENS mint</Link>
          </div>
        </div>
      ) : null}

      <div className="grid">
        <article className="card">
          <h3>Active Listings</h3>
          <p>{stats.listings}</p>
        </article>
        <article className="card">
          <h3>Resolved Wallets</h3>
          <p>{stats.resolvedWallets}</p>
        </article>
        <article className="card">
          <h3>Collections</h3>
          <p>{stats.uniqueCollections}</p>
        </article>
        <article className="card">
          <h3>Floor Price</h3>
          <p>{stats.floorPrice}</p>
        </article>
      </div>

      <div className="card formCard">
        <h3>Profile Snapshot</h3>
        <p className="sectionLead">
          This is the public identity layer that powers the storefront. It combines linked names, wallet ownership,
          and indexed creator collections so the same profile can feel like a personal landing page.
        </p>
        <div className="detailGrid">
          <div className="detailItem">
            <span className="detailLabel">Primary Name</span>
            <p className="detailValue">{primaryProfileName}</p>
          </div>
          <div className="detailItem">
            <span className="detailLabel">Linked Identities</span>
            <p className="detailValue">{linkedProfiles.length || 0}</p>
          </div>
          <div className="detailItem">
            <span className="detailLabel">Wallet Mappings</span>
            <p className="detailValue">{resolvedSellerAddresses.length}</p>
          </div>
          <div className="detailItem">
            <span className="detailLabel">Creator Collections</span>
            <p className="detailValue">{collectionSummaries.length}</p>
          </div>
        </div>
      </div>

      <div className="card formCard">
        <h3>Edit Profile</h3>
        {primaryProfile ? (
          <>
            <p className="sectionLead">
              Update the public-facing profile details for {primaryProfile.fullName}. Identity creation stays in setup; presentation details live here.
            </p>
            <div className="gridMini">
              <label>
                Display name
                <input value={editDisplayName} onChange={(e) => setEditDisplayName(e.target.value)} />
              </label>
              <label>
                Tagline
                <input value={editTagline} onChange={(e) => setEditTagline(e.target.value)} />
              </label>
              <label>
                Accent color
                <input value={editAccentColor} onChange={(e) => setEditAccentColor(e.target.value)} />
              </label>
              <label>
                Avatar URL
                <input value={editAvatarUrl} onChange={(e) => setEditAvatarUrl(e.target.value)} />
              </label>
              <label>
                Banner URL
                <input value={editBannerUrl} onChange={(e) => setEditBannerUrl(e.target.value)} />
              </label>
              <label>
                Featured media URL
                <input value={editFeaturedUrl} onChange={(e) => setEditFeaturedUrl(e.target.value)} />
              </label>
              <label>
                Bio
                <textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} />
              </label>
              <label>
                Links (one per line)
                <textarea value={editLinksText} onChange={(e) => setEditLinksText(e.target.value)} />
              </label>
            </div>
            <div className="row">
              <button type="button" onClick={() => void saveProfileDetails()} disabled={!canEditProfile || editState.status === "pending"}>
                {editState.status === "pending" ? "Saving..." : "Save Profile"}
              </button>
              {!canEditProfile ? <span className="hint">Connect the profile owner wallet to edit.</span> : null}
            </div>
            {editState.status === "error" ? <p className="error">{editState.message}</p> : null}
            {editState.status === "success" ? <p className="success">{editState.message}</p> : null}
          </>
        ) : (
          <>
            <p className="hint">No linked profile record is available to edit yet.</p>
            <div className="row">
              <Link href={`/profile/setup?label=${encodeURIComponent(name)}`} className="ctaLink secondaryLink">Open identity setup</Link>
            </div>
          </>
        )}
      </div>

      <div className="card formCard">
        <h3>Linked Wallets</h3>
        <p className="sectionLead">
          This section shows the wallet addresses and collection mappings currently published by the indexer for this ENS label.
        </p>
        {resolvedSellerAddresses.length === 0 ? (
          <p className="hint">No indexed wallet mapping has been published for this ENS label yet.</p>
        ) : (
          <div className="listTable">
            {resolvedSellerAddresses.map((wallet) => (
              <div key={wallet} className="listRow">
                <span><strong>Wallet</strong></span>
                {toExplorerAddress(wallet, config.chainId) ? (
                  <a href={toExplorerAddress(wallet, config.chainId)!} target="_blank" rel="noreferrer" className="mono">
                    {wallet}
                  </a>
                ) : (
                  <span className="mono">{wallet}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card formCard">
        <h3>Creator Collection Wall</h3>
        <p className="sectionLead">
          These are the creator-owned contracts the indexer currently ties to this ENS identity.
        </p>
        {collectionSummaries.length === 0 ? (
          <p className="hint">
            No creator collections are currently indexed for this ENS label. Shared-mint activity can still
            appear below if listings exist for the resolved wallet.
          </p>
        ) : (
          <div className="listTable">
            {collectionSummaries.map((collection) => (
              <div key={collection.contractAddress} className="listRow">
                <span>
                  <strong>ENS</strong> {collection.ensSubname || `${name}.nftfactory.eth`}
                </span>
                <span>
                  <strong>Active listings</strong> {collection.activeListings}
                </span>
                {toExplorerAddress(collection.contractAddress, config.chainId) ? (
                  <a href={toExplorerAddress(collection.contractAddress, config.chainId)!} target="_blank" rel="noreferrer" className="mono">
                    Collection {truncateAddress(collection.contractAddress)}
                  </a>
                ) : (
                  <span className="mono">Collection {truncateAddress(collection.contractAddress)}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card formCard">
        <h3>Storefront Feed</h3>
        <p className="sectionLead">
          Storefront inventory currently visible for the resolved wallets on the configured marketplace.
        </p>
        {creatorListings.length === 0 ? (
          <p className="hint">
            No active listings were found for the resolved wallets at the current scan depth. Increase the
            scan depth or verify the wallet mapping above.
          </p>
        ) : null}
        {creatorListings.length === 0 ? (
          <div className="row">
            <button type="button" onClick={() => setScanDepth("500")}>
              Set Scan Depth To 500
            </button>
            <button type="button" onClick={() => void loadListings()} disabled={isLoading}>
              {isLoading ? "Refreshing..." : "Retry Profile Scan"}
            </button>
          </div>
        ) : null}
        {creatorListings.length > 0 ? (
          <div className="listTable">
            {creatorListings.map((listing) => (
              <article key={listing.id} className="listRow profileListingRow">
                <span>
                  <strong>Listing</strong> #{listing.id}
                </span>
                <span>
                  <strong>Standard</strong> {listing.standard}
                </span>
                <span>
                  <strong>Token</strong> #{listing.tokenId.toString()}
                </span>
                <span>
                  <strong>Amount</strong> {listing.amount.toString()}
                </span>
                <span>
                  <strong>Price</strong> {formatListingPrice(listing)}
                </span>
                {toExplorerAddress(listing.nft, config.chainId) ? (
                  <a href={toExplorerAddress(listing.nft, config.chainId)!} target="_blank" rel="noreferrer" className="mono">
                    Contract {truncateAddress(listing.nft)}
                  </a>
                ) : (
                  <span className="mono">Contract {truncateAddress(listing.nft)}</span>
                )}
                {toExplorerAddress(listing.seller, config.chainId) ? (
                  <a href={toExplorerAddress(listing.seller, config.chainId)!} target="_blank" rel="noreferrer" className="mono">
                    Seller {truncateAddress(listing.seller)}
                  </a>
                ) : (
                  <span className="mono">Seller {truncateAddress(listing.seller)}</span>
                )}
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
