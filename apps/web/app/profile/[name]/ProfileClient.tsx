"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Address } from "viem";
import { getContractsConfig } from "../../../lib/contracts";
import {
  fetchActiveListingsBatch,
  formatListingPrice,
  toExplorerAddress,
  truncateAddress,
  type MarketplaceListing
} from "../../../lib/marketplace";
import { fetchHiddenListingIds, fetchProfileResolution, type ApiProfileResolution } from "../../../lib/indexerApi";

function isAddress(value: string): value is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export default function ProfileClient({ name }: { name: string }) {
  const config = useMemo(() => getContractsConfig(), []);

  const [sellerAddress, setSellerAddress] = useState("");
  const [scanDepth, setScanDepth] = useState("250");
  const [allListings, setAllListings] = useState<MarketplaceListing[]>([]);
  const [hiddenListingIds, setHiddenListingIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [indexerError, setIndexerError] = useState("");
  const [profileResolution, setProfileResolution] = useState<ApiProfileResolution | null>(null);

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

  const hasResolvedIdentity = resolvedSellerAddresses.length > 0;
  const hasManualWallet = Boolean(sellerAddress.trim());
  const hasProfileData = hasResolvedIdentity || hasManualWallet;

  return (
    <section className="wizard">
      <div className="heroCard">
        <p className="eyebrow">Creator Profile</p>
        <h1>{name}.nftfactory.eth</h1>
        <p className="heroText">
          Creator storefront view with live listings, indexed collection mappings, and ENS-based identity
          resolved through the indexer.
        </p>
        <div className="row">
          <Link href="/discover" className="ctaLink secondaryLink">Browse marketplace</Link>
          <Link href="/mint?view=mint&collection=shared" className="ctaLink secondaryLink">Mint with this identity</Link>
        </div>
        <div className="flowStrip">
          <div className="flowCell">
            <span className="flowLabel">Resolve</span>
            <p className="hint">Start with ENS mapping, then fall back to a manual wallet if needed.</p>
          </div>
          <div className="flowCell">
            <span className="flowLabel">Inspect</span>
            <p className="hint">Review linked creator collections, wallets, and active storefront listings.</p>
          </div>
          <div className="flowCell">
            <span className="flowLabel">Continue</span>
            <p className="hint">Jump back into minting or discovery once the creator identity is verified.</p>
          </div>
        </div>
      </div>

      <div className="card formCard">
        <h3>Lookup Controls</h3>
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
            <Link href="/profile" className="ctaLink secondaryLink">Try another ENS label</Link>
            <Link href="/discover" className="ctaLink secondaryLink">Browse all listings</Link>
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
        <h3>ENS Identity Mapping</h3>
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
        <h3>Indexed Creator Collections</h3>
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
        <h3>Active Listings</h3>
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
      </div>

      <div className="listTable">
        {creatorListings.map((listing) => (
          <article key={listing.id} className="listRow">
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
    </section>
  );
}
