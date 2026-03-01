import { createPublicClient, formatEther, http } from "viem";
import type { Address } from "viem";
import { getAppChain, getExplorerBaseUrl } from "./chains";

export type MarketplaceListing = {
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
};

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const LISTING_READ_BATCH_SIZE = 20;

export const marketplaceAbi = [
  {
    type: "function",
    name: "nextListingId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "listings",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "seller", type: "address" },
      { name: "nft", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "standard", type: "string" },
      { name: "paymentToken", type: "address" },
      { name: "price", type: "uint256" },
      { name: "expiresAt", type: "uint256" },
      { name: "active", type: "bool" }
    ]
  }
] as const;

export function toExplorerAddress(address: string, chainId: number): string | null {
  const baseUrl = getExplorerBaseUrl(chainId);
  return baseUrl ? `${baseUrl}/address/${address}` : null;
}

export function truncateAddress(address: string): string {
  if (address.length < 14) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

export function formatListingPrice(listing: MarketplaceListing): string {
  if (listing.paymentToken === ZERO_ADDRESS) {
    return `${formatEther(listing.price)} ETH`;
  }
  return `${listing.price.toString()} raw ERC20 units`;
}

export async function fetchActiveListingsBatch(params: {
  chainId: number;
  rpcUrl: string;
  marketplace: Address;
  cursor?: number | null;
  limit: number;
}): Promise<{ listings: MarketplaceListing[]; nextCursor: number; canLoadMore: boolean }> {
  const { chainId, rpcUrl, marketplace, cursor = null, limit } = params;

  const publicClient = createPublicClient({
    chain: getAppChain(chainId),
    transport: http(rpcUrl)
  });

  const nextId = (await publicClient.readContract({
    address: marketplace,
    abi: marketplaceAbi,
    functionName: "nextListingId"
  })) as bigint;

  const end = cursor === null ? Number(nextId) : cursor;
  const start = Math.max(0, end - limit);
  const rows: MarketplaceListing[] = [];

  const ids: number[] = [];
  for (let id = end - 1; id >= start; id -= 1) {
    ids.push(id);
  }

  for (let offset = 0; offset < ids.length; offset += LISTING_READ_BATCH_SIZE) {
    const batch = ids.slice(offset, offset + LISTING_READ_BATCH_SIZE);
    const listings = (await Promise.all(
      batch.map((id) =>
        publicClient.readContract({
          address: marketplace,
          abi: marketplaceAbi,
          functionName: "listings",
          args: [BigInt(id)]
        })
      )
    )) as readonly (readonly [Address, Address, bigint, bigint, string, Address, bigint, bigint, boolean])[];

    for (let i = 0; i < listings.length; i += 1) {
      const listing = listings[i];
      const id = batch[i];
      if (!listing[8]) {
        continue;
      }
      if (listing[7] <= BigInt(Math.floor(Date.now() / 1000))) {
        continue;
      }

      rows.push({
        id,
        seller: listing[0],
        nft: listing[1],
        tokenId: listing[2],
        amount: listing[3],
        standard: listing[4],
        paymentToken: listing[5],
        price: listing[6],
        expiresAt: listing[7],
        active: listing[8]
      });
    }
  }

  return {
    listings: rows,
    nextCursor: start,
    canLoadMore: start > 0
  };
}
