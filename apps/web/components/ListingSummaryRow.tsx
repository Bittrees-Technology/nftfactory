"use client";

import type { ReactNode } from "react";
import { getAppChain } from "../lib/chains";
import { toExplorerAddress, truncateAddress } from "../lib/marketplace";
import { useNftMetadataPreview } from "../lib/nftMetadata";
import { getListingPresentation, type ListingViewModel } from "../lib/listingPresentation";

type Props = {
  item: ListingViewModel;
  chainId?: number;
  ipfsGateway: string;
  actions?: ReactNode;
  className?: string;
  showSeller?: boolean;
};

export default function ListingSummaryRow({
  item,
  chainId,
  ipfsGateway,
  actions,
  className = "listRow profileListingRow",
  showSeller = true
}: Props) {
  const preview = useNftMetadataPreview({
    metadataUri: item.metadataCid,
    mediaUri: item.mediaCid,
    gateway: ipfsGateway
  });
  const presentation = getListingPresentation(item, preview);
  const effectiveChainId = chainId || item.chainId;

  return (
    <article className={className}>
      <span>
        <strong>{presentation.listingLabel}</strong>
      </span>
      <span>
        <strong>{presentation.title}</strong>
      </span>
      <span>{presentation.description}</span>
      <span>
        <strong>Standard</strong> {item.standard}
      </span>
      <span>
        <strong>Token</strong> #{item.tokenId.toString()}
      </span>
      <span>
        <strong>Amount</strong> {presentation.amountLabel}
      </span>
      <span>
        <strong>Price</strong> {presentation.priceLabel}
      </span>
      <span>
        <strong>Ends</strong> {presentation.expiresAtLabel}
      </span>
      <span>
        <strong>Chain</strong> {getAppChain(effectiveChainId).name}
      </span>
      {presentation.collectionIdentity ? (
        <span>
          <strong>Collection</strong> {presentation.collectionIdentity}
        </span>
      ) : null}
      {toExplorerAddress(item.nft, effectiveChainId) ? (
        <a href={toExplorerAddress(item.nft, effectiveChainId)!} target="_blank" rel="noreferrer" className="mono">
          Contract {truncateAddress(item.nft)}
        </a>
      ) : (
        <span className="mono">Contract {truncateAddress(item.nft)}</span>
      )}
      {showSeller
        ? toExplorerAddress(item.seller, effectiveChainId) ? (
            <a href={toExplorerAddress(item.seller, effectiveChainId)!} target="_blank" rel="noreferrer" className="mono">
              Seller {truncateAddress(item.seller)}
            </a>
          ) : (
            <span className="mono">Seller {truncateAddress(item.seller)}</span>
          )
        : null}
      {actions ? <div className="row">{actions}</div> : null}
    </article>
  );
}
