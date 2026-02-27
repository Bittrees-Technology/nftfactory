"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import { getContractsConfig } from "../../../lib/contracts";
import {
  fetchActiveListingsBatch,
  formatListingPrice,
  toExplorerAddress,
  truncateAddress,
  type MarketplaceListing
} from "../../../lib/marketplace";
import { fetchHiddenListingIds, fetchProfileResolution } from "../../../lib/indexerApi";

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

  const loadListings = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError("");
    try {
      const parsedDepth = Number.parseInt(scanDepth, 10);
      const limit = Number.isInteger(parsedDepth) && parsedDepth > 0 ? parsedDepth : 250;
      const result = await fetchActiveListingsBatch({
        rpcUrl: config.rpcUrl,
        marketplace: config.marketplace as Address,
        cursor: null,
        limit
      });
      setAllListings(result.listings);
      setHiddenListingIds(await fetchHiddenListingIds());
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
    if (sellerAddress) return;
    const run = async (): Promise<void> => {
      try {
        const resolution = await fetchProfileResolution(name);
        const resolvedSeller = resolution.sellers[0];
        if (resolvedSeller && isAddress(resolvedSeller)) {
          setSellerAddress(resolvedSeller);
          setResolutionNote(`Resolved from indexer profile mapping (${resolution.name})`);
        } else {
          setResolutionNote("No backend mapping found yet. Enter wallet manually.");
        }
      } catch {
        setResolutionNote("Profile resolution unavailable. Enter wallet manually.");
      }
    };
    void run();
  }, [name, sellerAddress]);

  const creatorListings = useMemo(() => {
    if (!isAddress(sellerAddress)) return [];
    const hidden = new Set(hiddenListingIds);
    return allListings.filter(
      (listing) => listing.seller.toLowerCase() === sellerAddress.toLowerCase() && !hidden.has(listing.id)
    );
  }, [allListings, hiddenListingIds, sellerAddress]);

  const stats = useMemo(() => {
    if (creatorListings.length === 0) {
      return { listings: 0, uniqueCollections: 0, floorPrice: "-" };
    }

    const collections = new Set(creatorListings.map((item) => item.nft.toLowerCase()));
    let floor = creatorListings[0].price;
    for (const item of creatorListings) {
      if (item.price < floor) floor = item.price;
    }

    return {
      listings: creatorListings.length,
      uniqueCollections: collections.size,
      floorPrice: formatListingPrice({ ...creatorListings[0], price: floor })
    };
  }, [creatorListings]);

  return (
    <section className="wizard">
      <div>
        <h1>{name}.nftfactory.eth</h1>
        <p>Creator storefront view with live listings and quick performance stats.</p>
      </div>

      <div className="card formCard">
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
        </div>
        {!isAddress(sellerAddress) ? (
          <p className="hint">Enter a valid creator wallet address to populate this profile.</p>
        ) : null}
        {resolutionNote ? <p className="hint">{resolutionNote}</p> : null}
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="grid">
        <article className="card">
          <h3>Active Listings</h3>
          <p>{stats.listings}</p>
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
            <a href={toExplorerAddress(listing.nft)} target="_blank" rel="noreferrer" className="mono">
              Contract {truncateAddress(listing.nft)}
            </a>
            <a href={toExplorerAddress(listing.seller)} target="_blank" rel="noreferrer" className="mono">
              Seller {truncateAddress(listing.seller)}
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}
