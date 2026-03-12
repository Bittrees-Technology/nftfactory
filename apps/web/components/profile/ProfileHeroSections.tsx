"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import DetailGridItem from "../DetailGridItem";
import { getAppChain } from "../../lib/chains";
import type { ApiProfileRecord } from "../../lib/indexerApi";
import type { ListingViewModel } from "../../lib/listingPresentation";
import { toExplorerAddress, truncateAddress } from "../../lib/marketplace";

type ProfileStats = {
  listings: number;
  offersMade: number;
  offersReceived: number;
  uniqueCollections: number;
  floorPrice: string;
  resolvedWallets: number;
};

type ProfileCollectionSummary = {
  chainId?: number;
  ensSubname: string | null;
  contractAddress: string;
  ownerAddress: string;
  activeListings: number;
};

type FeaturedListingPresentation = {
  listingLabel?: string | null;
  title?: string | null;
  description?: string | null;
  collectionIdentity?: string | null;
  amountLabel?: string | null;
  priceLabel?: string | null;
  marketLabel?: string | null;
  expiresAtLabel?: string | null;
};

type ProfileHeroSectionsProps = {
  name: string;
  mintProfileParam: string;
  canEditProfile: boolean;
  primaryProfile: ApiProfileRecord | null;
  linkedProfiles: ApiProfileRecord[];
  primaryProfileName: string;
  creatorDisplayName: string;
  creatorTagline: string;
  creatorBio: string;
  canonicalRoute: string;
  hasResolvedIdentity: boolean;
  heroStyle?: CSSProperties;
  stats: ProfileStats;
  featuredMediaKind: "image" | "audio" | "video" | "link" | null;
  featuredListing: ListingViewModel | null;
  featuredListingPresentation: FeaturedListingPresentation | null;
  pinnedCollection: ProfileCollectionSummary | null;
  configChainId: number;
};

export default function ProfileHeroSections({
  name,
  mintProfileParam,
  canEditProfile,
  primaryProfile,
  linkedProfiles,
  primaryProfileName,
  creatorDisplayName,
  creatorTagline,
  creatorBio,
  canonicalRoute,
  hasResolvedIdentity,
  heroStyle,
  stats,
  featuredMediaKind,
  featuredListing,
  featuredListingPresentation,
  pinnedCollection,
  configChainId
}: ProfileHeroSectionsProps) {
  return (
    <>
      <div className="profileHeroShell">
        <section className="card profileIdentityCard profileIdentityHeroCard">
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
          <div className="profileHeroActions">
            <Link href={`/mint?view=mint&collection=shared&profile=${encodeURIComponent(mintProfileParam)}`} className="ctaLink secondaryLink">
              Mint from this profile
            </Link>
            <Link href={`/mint?view=view&profile=${encodeURIComponent(mintProfileParam)}`} className="ctaLink secondaryLink">
              View collection tools
            </Link>
            {canEditProfile ? (
              <Link href={`${canonicalRoute}#listing-management`} className="ctaLink secondaryLink">
                Jump to listing management
              </Link>
            ) : null}
          </div>
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
                  <span className="hint">
                    {profile.source === "nftfactory-subname"
                      ? "nftfactory subname"
                      : profile.source === "external-subname"
                        ? "linked subdomain"
                        : "linked ENS"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="hint">
              No linked identity records were returned. This page is relying on collection ownership or manual wallet resolution.
            </p>
          )}
        </section>

        <section className="card profileFeatureCard profileFeatureSpotlightCard">
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
              <h3>{featuredListingPresentation?.listingLabel || `Listing #${featuredListing.id}`}</h3>
              <p className="sectionLead">
                {featuredListingPresentation?.title || `Token #${featuredListing.tokenId.toString()}`}
              </p>
              <p className="hint">{featuredListingPresentation?.description}</p>
              <div className="detailGrid">
                <DetailGridItem
                  label="Collection"
                  value={featuredListingPresentation?.collectionIdentity || truncateAddress(featuredListing.nft)}
                />
                <DetailGridItem
                  label="Seller"
                  value={truncateAddress(featuredListing.seller)}
                  valueClassName="detailValue mono"
                />
                <DetailGridItem
                  label="Amount"
                  value={featuredListingPresentation?.amountLabel || featuredListing.amount.toString()}
                />
                <DetailGridItem
                  label="Pricing"
                  value={featuredListingPresentation?.priceLabel || featuredListing.price.toString()}
                />
                <DetailGridItem
                  label="Market"
                  value={featuredListingPresentation?.marketLabel || "Marketplace"}
                />
                <DetailGridItem
                  label="Ends"
                  value={featuredListingPresentation?.expiresAtLabel || "Indexed"}
                />
              </div>
            </>
          ) : (
            <>
              <h3>No Featured Listing Yet</h3>
              <p className="sectionLead">
                This creator page does not have a live listing to spotlight yet. Mint and list under this identity to give the storefront something to feature.
              </p>
              <div className="row">
                <Link href={`/mint?view=mint&collection=shared&profile=${encodeURIComponent(mintProfileParam)}`} className="ctaLink secondaryLink">
                  Mint from this profile
                </Link>
                <Link href={`${canonicalRoute}#listing-management`} className="ctaLink secondaryLink">
                  Create a listing
                </Link>
              </div>
            </>
          )}
        </section>
      </div>

      <div className="profileStoryShell">
        <section className="card profileFeatureCard profileStoryCard">
          <p className="eyebrow">About</p>
          <h3>Creator Wall</h3>
          <p className="sectionLead">{creatorBio}</p>
          <div className="detailGrid">
            <DetailGridItem label="Primary Route" value={`/profile/${name}`} valueClassName="detailValue mono" />
            <DetailGridItem label="Identity Count" value={linkedProfiles.length} />
            <DetailGridItem label="Live Listings" value={stats.listings} />
            <DetailGridItem
              label="Offers"
              value={`${stats.offersReceived} received / ${stats.offersMade} made`}
            />
            <DetailGridItem label="Collections" value={stats.uniqueCollections} />
          </div>
        </section>

        <section className="card profileIdentityCard profileLinksCard">
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

      <div className="card formCard profilePinnedCollectionCard">
        <h3>Pinned Collection</h3>
        {pinnedCollection ? (
          <>
            <p className="sectionLead">
              {pinnedCollection.ensSubname?.trim()
                ? `${pinnedCollection.ensSubname}${pinnedCollection.ensSubname.includes(".") ? "" : ".nftfactory.eth"}`
                : "Primary creator collection"}
            </p>
            <div className="detailGrid">
              <DetailGridItem
                label="Contract"
                value={
                  toExplorerAddress(pinnedCollection.contractAddress, pinnedCollection.chainId || configChainId) ? (
                    <a
                      href={toExplorerAddress(pinnedCollection.contractAddress, pinnedCollection.chainId || configChainId)!}
                      target="_blank"
                      rel="noreferrer"
                      className="mono"
                    >
                      {pinnedCollection.contractAddress}
                    </a>
                  ) : (
                    <span className="mono">{pinnedCollection.contractAddress}</span>
                  )
                }
              />
              <DetailGridItem
                label="Owner"
                value={truncateAddress(pinnedCollection.ownerAddress)}
                valueClassName="detailValue mono"
              />
              <DetailGridItem label="Chain" value={getAppChain(pinnedCollection.chainId || configChainId).name} />
              <DetailGridItem label="Live Listings" value={pinnedCollection.activeListings} />
            </div>
          </>
        ) : (
          <p className="hint">No creator collection is pinned yet. Link a collection during profile setup to feature it here.</p>
        )}
      </div>
    </>
  );
}
