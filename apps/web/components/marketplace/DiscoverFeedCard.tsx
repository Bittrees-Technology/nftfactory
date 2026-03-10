"use client";

import Link from "next/link";
import type { Dispatch, SetStateAction } from "react";
import DetailGridItem from "../DetailGridItem";
import type { ApiMintFeedItem } from "../../lib/indexerApi";
import { getExplorerBaseUrl } from "../../lib/chains";
import {
  ipfsToGatewayUrl,
  looksLikeAudioUrl,
  looksLikeImageUrl,
  type NftMetadataPreview
} from "../../lib/nftMetadata";
import {
  formatCollectionIdentity,
  getMintAmountLabel,
  getMintSourceLabel
} from "../../lib/nftPresentation";
import {
  getOwnerHoldingPresentation,
  normalizeOwnerHoldingAmountRaw
} from "../../lib/ownerHoldingPresentation";
import { toExplorerAddress, truncateAddress } from "../../lib/marketplace";

export type DiscoverFeedRow = ApiMintFeedItem & {
  draftName?: string | null;
  draftDescription?: string | null;
  mintedAmountRaw?: string | null;
};

export type DiscoverOfferDraft = {
  rowId: string;
  paymentTokenType: "ETH" | "ERC20";
  erc20Address: string;
  priceInput: string;
  durationDays: string;
  quantity: string;
};

type DiscoverFeedCardProps = {
  row: DiscoverFeedRow;
  chainName: string;
  chainId: number;
  ipfsGateway: string;
  address?: string;
  isConnected: boolean;
  wrongNetwork: boolean;
  sharedContractAddresses: Set<string>;
  preview: NftMetadataPreview | null | undefined;
  offerDraft: DiscoverOfferDraft | null;
  buyingListingId: string;
  submittingOfferRowId: string;
  onBuyNow: (row: DiscoverFeedRow) => void;
  onOpenOfferComposer: (row: DiscoverFeedRow) => void;
  onCloseOfferComposer: () => void;
  onSubmitOffer: (row: DiscoverFeedRow) => void;
  setOfferDraft: Dispatch<SetStateAction<DiscoverOfferDraft | null>>;
};

function getDraftName(row: DiscoverFeedRow): string | null {
  return row.draftName?.trim() || null;
}

function getDraftDescription(row: DiscoverFeedRow): string | null {
  return row.draftDescription?.trim() || null;
}

function getMintedAmountRaw(row: DiscoverFeedRow): string | null {
  return row.mintedAmountRaw?.trim() || null;
}

function getHeldAmountRaw(row: DiscoverFeedRow): string | null {
  return row.heldAmountRaw?.trim() || null;
}

function getReservedAmountRaw(row: DiscoverFeedRow): string | null {
  return normalizeOwnerHoldingAmountRaw(row.reservedAmountRaw);
}

function getAvailableAmountRaw(row: DiscoverFeedRow): string | null {
  return normalizeOwnerHoldingAmountRaw(row.availableAmountRaw);
}

function getCurrentOwnerAddresses(row: DiscoverFeedRow): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  const candidates =
    Array.isArray(row.currentOwnerAddresses) && row.currentOwnerAddresses.length > 0
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

function normalizeAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function getListingActionKey(listing: ApiMintFeedItem["activeListing"] | null | undefined): string {
  if (!listing) return "";
  return `${listing.marketplaceVersion || "v1"}:${listing.listingRecordId || listing.listingId || ""}`;
}

function toExplorerTx(chainId: number, hash: string | null | undefined): string | null {
  if (!hash) return null;
  const baseUrl = getExplorerBaseUrl(chainId);
  return baseUrl ? `${baseUrl}/tx/${hash}` : null;
}

function FeedCardMedia({
  preview,
  metadataLink,
  mediaLink,
  title
}: {
  preview: NftMetadataPreview | null | undefined;
  metadataLink: string | null;
  mediaLink: string | null;
  title: string;
}) {
  if (preview?.imageUrl) {
    return <img src={preview.imageUrl} alt={title} className="feedCardMediaImage" />;
  }
  if (preview?.audioUrl) {
    return (
      <audio controls preload="none" className="feedCardMediaAudio">
        <source src={preview.audioUrl} />
      </audio>
    );
  }
  if (mediaLink) {
    return (
      <a href={mediaLink} target="_blank" rel="noreferrer" className="feedCardMediaFallback">
        Open media
      </a>
    );
  }
  if (metadataLink) {
    return (
      <a href={metadataLink} target="_blank" rel="noreferrer" className="feedCardMediaFallback">
        View metadata
      </a>
    );
  }
  return <div className="feedCardMediaFallback">Preview pending</div>;
}

export default function DiscoverFeedCard({
  row,
  chainName,
  chainId,
  ipfsGateway,
  address,
  isConnected,
  wrongNetwork,
  sharedContractAddresses,
  preview,
  offerDraft,
  buyingListingId,
  submittingOfferRowId,
  onBuyNow,
  onOpenOfferComposer,
  onCloseOfferComposer,
  onSubmitOffer,
  setOfferDraft
}: DiscoverFeedCardProps) {
  const contractExplorer = toExplorerAddress(row.collection.contractAddress, chainId);
  const currentOwnerAddresses = getCurrentOwnerAddresses(row);
  const primaryOwnerAddress = currentOwnerAddresses[0] || row.ownerAddress;
  const ownerExplorer = currentOwnerAddresses.length === 1 ? toExplorerAddress(primaryOwnerAddress, chainId) : "";
  const creatorExplorer = toExplorerAddress(row.creatorAddress, chainId);
  const mintedAtLabel = Number.isNaN(new Date(row.mintedAt).getTime())
    ? row.mintedAt
    : new Date(row.mintedAt).toLocaleString();
  const txLink = toExplorerTx(chainId, row.mintTxHash);
  const metadataLink = ipfsToGatewayUrl(row.metadataCid, ipfsGateway);
  const mediaLink = ipfsToGatewayUrl(row.mediaCid, ipfsGateway);
  const fallbackPreview: NftMetadataPreview = {
    name: null,
    description: null,
    imageUrl: looksLikeImageUrl(mediaLink) ? mediaLink : null,
    audioUrl: looksLikeAudioUrl(mediaLink) ? mediaLink : null
  };
  const resolvedPreview = preview || fallbackPreview;
  const ownerHolding = getOwnerHoldingPresentation({
    standard: row.collection.standard,
    tokenId: row.tokenId,
    ensSubname: formatCollectionIdentity(row.collection.ensSubname),
    draftName: getDraftName(row),
    draftDescription: getDraftDescription(row),
    previewName: resolvedPreview?.name,
    previewDescription: resolvedPreview?.description,
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
  const isOwnListing = Boolean(
    address && row.activeListing && row.activeListing.sellerAddress.toLowerCase() === address.toLowerCase()
  );

  return (
    <article key={row.id} className="feedCard">
      <div className="feedCardHero">
        <FeedCardMedia
          preview={resolvedPreview}
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
                Created on {chainName} (chain {row.collection.chainId})
              </p>
            </div>

            <div className="feedCardFacts">
              <DetailGridItem
                className="feedFact"
                labelClassName="feedFactLabel"
                label={row.collection.standard.toUpperCase() === "ERC1155" ? "Supply" : "Amount"}
                value={ownerHolding.supplyAmountLabel}
              />
              {getHeldAmountRaw(row) ? (
                <DetailGridItem
                  className="feedFact"
                  labelClassName="feedFactLabel"
                  label="Held"
                  value={ownerHolding.heldAmountLabel}
                />
              ) : null}
              {ownerHolding.reservedAmountLabel ? (
                <DetailGridItem
                  className="feedFact"
                  labelClassName="feedFactLabel"
                  label="Listed"
                  value={ownerHolding.reservedAmountLabel}
                />
              ) : null}
              {ownerHolding.availableAmountLabel ? (
                <DetailGridItem
                  className="feedFact"
                  labelClassName="feedFactLabel"
                  label="Available"
                  value={ownerHolding.availableAmountLabel}
                />
              ) : null}
              <DetailGridItem
                className="feedFact"
                labelClassName="feedFactLabel"
                label="Contract"
                value={
                  contractExplorer ? (
                    <a href={contractExplorer} target="_blank" rel="noreferrer" className="mono">
                      {truncateAddress(row.collection.contractAddress)}
                    </a>
                  ) : (
                    <span className="mono">{truncateAddress(row.collection.contractAddress)}</span>
                  )
                }
              />
              <DetailGridItem
                className="feedFact"
                labelClassName="feedFactLabel"
                label="Owner"
                value={
                  currentOwnerAddresses.length > 1 ? (
                    <span className="mono">{`${currentOwnerAddresses.length} holders`}</span>
                  ) : ownerExplorer ? (
                    <a href={ownerExplorer} target="_blank" rel="noreferrer" className="mono">
                      {truncateAddress(primaryOwnerAddress)}
                    </a>
                  ) : (
                    <span className="mono">{truncateAddress(primaryOwnerAddress)}</span>
                  )
                }
              />
              <DetailGridItem
                className="feedFact"
                labelClassName="feedFactLabel"
                label="Creator"
                value={
                  creatorExplorer ? (
                    <a href={creatorExplorer} target="_blank" rel="noreferrer" className="mono">
                      {truncateAddress(row.creatorAddress)}
                    </a>
                  ) : (
                    <span className="mono">{truncateAddress(row.creatorAddress)}</span>
                  )
                }
              />
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
          onClick={() => void onBuyNow(row)}
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
          onClick={() => (offerDraft?.rowId === row.id ? onCloseOfferComposer() : onOpenOfferComposer(row))}
        >
          {offerDraft?.rowId === row.id ? "Close offer" : "Make offer"}
        </button>
        {row.activeListing ? (
          <Link href="/profile" className="feedLinkPill muted">
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
              Your indexed balance: {getMintAmountLabel(row.collection.standard, getHeldAmountRaw(row), "Balance not indexed")}. Offer quantity is not limited by your current holdings.
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
                  placeholder="1"
                />
              </label>
            ) : null}
          </div>
          <p className="hint">
            Offers are escrowed in Marketplace V2. ETH offers send value with the transaction. ERC20 offers approve and escrow the total amount first.
          </p>
          {offerDraft.paymentTokenType === "ERC20" ? (
            <p className="hint">
              Custom ERC20s must already be allowlisted in the registry before Marketplace V2 will accept the offer.
            </p>
          ) : null}
          <div className="row">
            <button
              type="button"
              onClick={() => void onSubmitOffer(row)}
              disabled={!isConnected || wrongNetwork || submittingOfferRowId === row.id}
            >
              {submittingOfferRowId === row.id ? "Submitting offer..." : "Submit offer"}
            </button>
            <button type="button" className="miniBtn" onClick={onCloseOfferComposer} disabled={submittingOfferRowId === row.id}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
