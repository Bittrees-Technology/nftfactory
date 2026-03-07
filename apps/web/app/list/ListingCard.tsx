"use client";

import type { Address } from "viem";
import { truncateHash } from "../../lib/abi";
import { getAppChain, getExplorerBaseUrl } from "../../lib/chains";
import { getListingPresentation, type ListingViewModel } from "../../lib/listingPresentation";
import { ipfsToGatewayUrl, useNftMetadataPreview } from "../../lib/nftMetadata";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export type ListingRow = ListingViewModel & {
  marketplaceAddress: Address;
  marketplaceLabel: string;
};

type Props = {
  item: ListingRow;
  ipfsGateway: string;
  chainId: number;
  currentAddress?: string;
  wrongNetwork: boolean;
  isConnected: boolean;
  isBuying: boolean;
  isCanceling: boolean;
  copiedKey: string;
  onBuy: (item: ListingRow) => void;
  onCancel: (item: ListingRow) => void;
  onUpdate: (item: ListingRow) => void;
  onCopy: (key: string, value: string) => void;
  variant: "mine" | "marketplace";
};

export default function ListingCard({
  item,
  ipfsGateway,
  chainId,
  currentAddress,
  wrongNetwork,
  isConnected,
  isBuying,
  isCanceling,
  copiedKey,
  onBuy,
  onCancel,
  onUpdate,
  onCopy,
  variant
}: Props) {
  const prefix = variant === "mine" ? "my" : "all";
  const itemKeySuffix = `${item.marketplaceAddress.toLowerCase()}-${item.id}`;
  const isMine = !!currentAddress && item.seller.toLowerCase() === currentAddress.toLowerCase();
  const canBuy = !isMine && isConnected && !wrongNetwork;
  const appChain = getAppChain(chainId);
  const explorerBaseUrl = getExplorerBaseUrl(chainId);
  const txLink = item.mintTxHash && explorerBaseUrl ? `${explorerBaseUrl}/tx/${item.mintTxHash}` : null;
  const metadataUrl = ipfsToGatewayUrl(item.metadataCid, ipfsGateway);
  const mediaUrl = ipfsToGatewayUrl(item.mediaCid, ipfsGateway);
  const preview = useNftMetadataPreview({
    metadataUri: item.metadataCid,
    mediaUri: item.mediaCid,
    gateway: ipfsGateway
  });
  const presentation = getListingPresentation(item, preview);
  const mintedAtLabel = item.mintedAt
    ? Number.isNaN(new Date(item.mintedAt).getTime())
      ? item.mintedAt
      : new Date(item.mintedAt).toLocaleString()
    : "Unknown";

  return (
    <article className="feedCard">
      <div className="feedCardHero">
        <div className="feedCardMedia">
        {preview.imageUrl ? (
          <img
            src={preview.imageUrl}
            alt={presentation.title}
            className="feedCardImage"
            loading="lazy"
          />
        ) : preview.audioUrl ? (
          <div className="feedCardMediaFallback">
            <span className="feedCardFallbackLabel">Audio</span>
            <audio controls src={preview.audioUrl} className="feedCardAudio">
              Your browser does not support audio playback.
            </audio>
          </div>
        ) : (
          <div className="feedCardMediaFallback">
            <div className="feedCardFallbackCopy">
              <span className="feedCardFallbackLabel">NFT</span>
              <strong>#{item.tokenId.toString()}</strong>
            </div>
          </div>
        )}
        </div>

        <div className="feedCardContent">
          <div className="feedCardTop">
            <span className="feedCardStatus">{presentation.listingLabel}</span>
          </div>

          <div className="feedCardBody">
            <div className="feedCardMain">
              <p className="feedCardEyebrow">{item.standard}</p>
              <h3 className="feedCardTitle">{presentation.title}</h3>
              <p className="feedCardMetaLine">{presentation.description}</p>
              {presentation.collectionIdentity ? <p className="feedCardMetaLine">Collection {presentation.collectionIdentity}</p> : null}
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
              <p className="feedCardMetaLine">Created on {appChain.name} (chain {chainId})</p>
            </div>

            <div className="feedCardFacts">
              <div className="feedFact">
                <span className="feedFactLabel">Token</span>
                <span className="detailValue">#{item.tokenId.toString()}</span>
              </div>
              <div className="feedFact">
                <span className="feedFactLabel">Amount</span>
                <span className="detailValue">{presentation.amountLabel}</span>
              </div>
              <div className="feedFact">
                <span className="feedFactLabel">Price</span>
                <span className="detailValue">{presentation.priceLabel}</span>
              </div>
              <div className="feedFact">
                <span className="feedFactLabel">Market</span>
                <span className="detailValue">{presentation.marketLabel}</span>
              </div>
              <div className="feedFact">
                <span className="feedFactLabel">Ends</span>
                <span className="detailValue">{presentation.expiresAtLabel}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="feedCardLinks">
          <p className="mono">
            {truncateHash(item.nft)}{" "}
            <button type="button" className="miniBtn" onClick={() => onCopy(`${prefix}-nft-${itemKeySuffix}`, item.nft)}>
              {copiedKey === `${prefix}-nft-${itemKeySuffix}` ? "Copied" : "Copy"}
            </button>
          </p>
          {variant === "marketplace" ? (
            <p className="mono">
              {truncateHash(item.seller)}{" "}
              <button type="button" className="miniBtn" onClick={() => onCopy(`seller-${itemKeySuffix}`, item.seller)}>
                {copiedKey === `seller-${itemKeySuffix}` ? "Copied" : "Copy"}
              </button>
            </p>
          ) : null}
          {metadataUrl ? (
            <a href={metadataUrl} target="_blank" rel="noreferrer" className="feedLinkPill">
              Metadata
            </a>
          ) : null}
          {mediaUrl ? (
            <a href={mediaUrl} target="_blank" rel="noreferrer" className="feedLinkPill">
              Media
            </a>
          ) : null}
          {variant === "mine" ? (
            <>
              <button
                type="button"
                className="feedLinkPill"
                onClick={() => onUpdate(item)}
                disabled={isCanceling || wrongNetwork || !isConnected}
              >
                Update
              </button>
              <button
                type="button"
                onClick={() => onCancel(item)}
                disabled={isCanceling || wrongNetwork || !isConnected}
              >
                {isCanceling ? "Canceling..." : "Cancel"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onBuy(item)}
              disabled={!canBuy || isBuying}
            >
              {isBuying ? "Buying..." : isMine ? "Your Listing" : item.paymentToken === ZERO_ADDRESS ? "Buy" : "Buy (ERC20)"}
            </button>
          )}
      </div>
    </article>
  );
}
