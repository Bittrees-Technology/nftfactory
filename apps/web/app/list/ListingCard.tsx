"use client";

import { formatEther } from "viem";
import type { Address } from "viem";
import { truncateHash } from "../../lib/abi";

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
  active: boolean;
};

type Props = {
  item: ListingRow;
  currentAddress?: string;
  wrongNetwork: boolean;
  isConnected: boolean;
  isBuying: boolean;
  isCanceling: boolean;
  copiedKey: string;
  onBuy: (item: ListingRow) => void;
  onCancel: (id: number) => void;
  onCopy: (key: string, value: string) => void;
  variant: "mine" | "marketplace";
};

export default function ListingCard({
  item,
  currentAddress,
  wrongNetwork,
  isConnected,
  isBuying,
  isCanceling,
  copiedKey,
  onBuy,
  onCancel,
  onCopy,
  variant
}: Props) {
  const prefix = variant === "mine" ? "my" : "all";
  const isMine = !!currentAddress && item.seller.toLowerCase() === currentAddress.toLowerCase();
  const canBuy = !isMine && item.paymentToken === ZERO_ADDRESS && isConnected && !wrongNetwork;

  return (
    <div className="listRow">
      <p className="mono">#{item.id}</p>
      <p>{item.standard}</p>
      <p className="mono">
        {truncateHash(item.nft)}{" "}
        <button type="button" className="miniBtn" onClick={() => onCopy(`${prefix}-nft-${item.id}`, item.nft)}>
          {copiedKey === `${prefix}-nft-${item.id}` ? "Copied" : "Copy"}
        </button>
      </p>
      <p>Token {item.tokenId.toString()}</p>
      <p>Amt {item.amount.toString()}</p>
      <p>
        {formatEther(item.price)} {item.paymentToken === ZERO_ADDRESS ? "ETH" : "ERC20"}
      </p>
      {variant === "marketplace" && (
        <p className="mono">
          {truncateHash(item.seller)}{" "}
          <button type="button" className="miniBtn" onClick={() => onCopy(`seller-${item.id}`, item.seller)}>
            {copiedKey === `seller-${item.id}` ? "Copied" : "Copy"}
          </button>
        </p>
      )}
      {variant === "mine" ? (
        <button
          type="button"
          onClick={() => onCancel(item.id)}
          disabled={isCanceling || wrongNetwork || !isConnected}
        >
          {isCanceling ? "Canceling..." : "Cancel"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onBuy(item)}
          disabled={!canBuy || isBuying}
        >
          {isBuying ? "Buying..." : isMine ? "Your Listing" : item.paymentToken === ZERO_ADDRESS ? "Buy" : "ERC20 Soon"}
        </button>
      )}
    </div>
  );
}
