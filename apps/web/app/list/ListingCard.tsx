"use client";

import type { Address } from "viem";
import { truncateHash } from "../../lib/abi";
import { getAppChain, getExplorerBaseUrl } from "../../lib/chains";
import { formatListingPrice, type MarketplaceListing } from "../../lib/marketplace";
import { ipfsToGatewayUrl, useNftMetadataPreview } from "../../lib/nftMetadata";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export type ListingRow = {
  id: number;
  seller: Address;
  nft: Address;
  tokenId: bigint;
  amount: bigint;
  standard: string;
  paymentToken: Address;
  price: bigint;
  expiresAt: bigint;
  active: boolean;
  metadataCid?: string | null;
  mediaCid?: string | null;
  mintedAt?: string | null;
  mintTxHash?: string | null;
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
  onCancel: (id: number) => void;
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
  const title = preview.name || `Token #${item.tokenId.toString()}`;
  const description = preview.description || "No metadata description available.";
  const expiresAtLabel =
    item.expiresAt > 0n
      ? new Date(Number(item.expiresAt) * 1000).toLocaleDateString()
      : "Indexed";
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
            alt={title}
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
            <span className="feedCardStatus">Listing #{item.id}</span>
          </div>

          <div className="feedCardBody">
            <div className="feedCardMain">
              <p className="feedCardEyebrow">{item.standard}</p>
              <h3 className="feedCardTitle">{title}</h3>
              <p className="feedCardMetaLine">{description}</p>
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
                <span className="detailValue">{item.amount.toString()}</span>
              </div>
              <div className="feedFact">
                <span className="feedFactLabel">Price</span>
                <span className="detailValue">{formatListingPrice(item as MarketplaceListing)}</span>
              </div>
              <div className="feedFact">
                <span className="feedFactLabel">Ends</span>
                <span className="detailValue">{expiresAtLabel}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="feedCardLinks">
          <p className="mono">
            {truncateHash(item.nft)}{" "}
            <button type="button" className="miniBtn" onClick={() => onCopy(`${prefix}-nft-${item.id}`, item.nft)}>
              {copiedKey === `${prefix}-nft-${item.id}` ? "Copied" : "Copy"}
            </button>
          </p>
          {variant === "marketplace" ? (
            <p className="mono">
              {truncateHash(item.seller)}{" "}
              <button type="button" className="miniBtn" onClick={() => onCopy(`seller-${item.id}`, item.seller)}>
                {copiedKey === `seller-${item.id}` ? "Copied" : "Copy"}
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
                onClick={() => onCancel(item.id)}
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
