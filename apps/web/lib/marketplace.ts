import { createPublicClient, formatEther, http } from "viem";
import type { Address, PublicClient } from "viem";
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

export type MarketplaceOffer = {
  id: number;
  chainId: number;
  buyer: Address;
  nft: Address;
  tokenId: bigint;
  quantity: bigint;
  standard: string;
  indexedRecipients?: Address[];
  paymentToken: Address;
  price: bigint;
  expiresAt: bigint;
  active: boolean;
};

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MARKETPLACE_READ_BATCH_SIZE = 20;

const erc721OwnerOfAbi = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }]
  }
] as const;

const erc1155BalanceOfAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id", type: "uint256" }
    ],
    outputs: [{ name: "", type: "uint256" }]
  }
] as const;

const paymentTokenRegistryAbi = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "allowedPaymentToken",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "", type: "bool" }]
  }
] as const;

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

export const marketplaceV2Abi = [
  ...marketplaceAbi,
  {
    type: "function",
    name: "nextOfferId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "offers",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "buyer", type: "address" },
      { name: "nft", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "quantity", type: "uint256" },
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
  return formatMarketplacePrice(listing.paymentToken, listing.price);
}

export function formatOfferPrice(offer: MarketplaceOffer): string {
  return formatMarketplacePrice(offer.paymentToken, offer.price);
}

export function formatMarketplacePrice(paymentToken: Address, price: bigint): string {
  if (paymentToken === ZERO_ADDRESS) {
    return `${formatEther(price)} ETH`;
  }
  return `${price.toString()} raw ERC20 units`;
}

export async function readPaymentTokenAllowed(
  publicClient: PublicClient,
  registry: Address,
  paymentToken: Address
): Promise<boolean> {
  if (paymentToken.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
    return true;
  }

  return Boolean(
    await publicClient.readContract({
      address: registry,
      abi: paymentTokenRegistryAbi,
      functionName: "allowedPaymentToken",
      args: [paymentToken]
    })
  );
}

export async function readRegistryOwner(publicClient: PublicClient, registry: Address): Promise<Address> {
  return (await publicClient.readContract({
    address: registry,
    abi: paymentTokenRegistryAbi,
    functionName: "owner"
  })) as Address;
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

  for (let offset = 0; offset < ids.length; offset += MARKETPLACE_READ_BATCH_SIZE) {
    const batch = ids.slice(offset, offset + MARKETPLACE_READ_BATCH_SIZE);
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

export async function fetchActiveOffersBatch(params: {
  chainId: number;
  rpcUrl: string;
  marketplace: Address;
  cursor?: number | null;
  limit: number;
}): Promise<{ offers: MarketplaceOffer[]; nextCursor: number; canLoadMore: boolean }> {
  const { chainId, rpcUrl, marketplace, cursor = null, limit } = params;

  const publicClient = createPublicClient({
    chain: getAppChain(chainId),
    transport: http(rpcUrl)
  });

  const nextId = (await publicClient.readContract({
    address: marketplace,
    abi: marketplaceV2Abi,
    functionName: "nextOfferId"
  })) as bigint;

  const end = cursor === null ? Number(nextId) : cursor;
  const start = Math.max(0, end - limit);
  const currentUnix = BigInt(Math.floor(Date.now() / 1000));
  const rows: MarketplaceOffer[] = [];

  const ids: number[] = [];
  for (let id = end - 1; id >= start; id -= 1) {
    ids.push(id);
  }

  for (let offset = 0; offset < ids.length; offset += MARKETPLACE_READ_BATCH_SIZE) {
    const batch = ids.slice(offset, offset + MARKETPLACE_READ_BATCH_SIZE);
    const offers = (await Promise.all(
      batch.map((id) =>
        publicClient.readContract({
          address: marketplace,
          abi: marketplaceV2Abi,
          functionName: "offers",
          args: [BigInt(id)]
        })
      )
    )) as readonly (readonly [Address, Address, bigint, bigint, string, Address, bigint, bigint, boolean])[];

    for (let i = 0; i < offers.length; i += 1) {
      const offer = offers[i];
      const id = batch[i];
      if (!offer[8]) continue;
      if (offer[7] <= currentUnix) continue;

      rows.push({
        id,
        chainId,
        buyer: offer[0],
        nft: offer[1],
        tokenId: offer[2],
        quantity: offer[3],
        standard: offer[4],
        paymentToken: offer[5],
        price: offer[6],
        expiresAt: offer[7],
        active: offer[8]
      });
    }
  }

  return {
    offers: rows,
    nextCursor: start,
    canLoadMore: start > 0
  };
}

export async function resolveOfferRecipients(params: {
  chainId: number;
  rpcUrl: string;
  offers: MarketplaceOffer[];
  candidateAddresses: Address[];
}): Promise<Record<number, Address[]>> {
  const { chainId, rpcUrl, offers, candidateAddresses } = params;
  const normalizedCandidates = candidateAddresses.map((item) => item.toLowerCase() as Address);
  if (offers.length === 0 || normalizedCandidates.length === 0) {
    return {};
  }

  const publicClient = createPublicClient({
    chain: getAppChain(chainId),
    transport: http(rpcUrl)
  });

  const entries = await Promise.all(
    offers.map(async (offer) => {
      if (offer.standard.toUpperCase() === "ERC721") {
        try {
          const owner = (await publicClient.readContract({
            address: offer.nft,
            abi: erc721OwnerOfAbi,
            functionName: "ownerOf",
            args: [offer.tokenId]
          })) as Address;
          const normalizedOwner = owner.toLowerCase() as Address;
          return [offer.id, normalizedCandidates.includes(normalizedOwner) ? [normalizedOwner] : []] as const;
        } catch {
          return [offer.id, []] as const;
        }
      }

      const holders = await Promise.all(
        normalizedCandidates.map(async (candidate) => {
          try {
            const balance = (await publicClient.readContract({
              address: offer.nft,
              abi: erc1155BalanceOfAbi,
              functionName: "balanceOf",
              args: [candidate, offer.tokenId]
            })) as bigint;
            return balance > 0n ? candidate : null;
          } catch {
            return null;
          }
        })
      );

      return [offer.id, holders.filter((item): item is Address => Boolean(item))] as const;
    })
  );

  return Object.fromEntries(entries);
}
