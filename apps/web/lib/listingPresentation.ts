import type { Address } from "viem";
import type { ApiActiveListingItem } from "./indexerApi";
import { formatListingPrice, type MarketplaceListing } from "./marketplace";
import {
  formatCollectionIdentity,
  getMintDisplayDescription,
  getMintDisplayTitle
} from "./nftPresentation";

export type ListingViewModel = {
  key: string;
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
  draftName?: string | null;
  draftDescription?: string | null;
  ensSubname?: string | null;
  marketplaceAddress?: Address | null;
  marketplaceLabel?: string | null;
  marketplaceVersion?: string | null;
};

export function toListingViewModel(item: ApiActiveListingItem): ListingViewModel {
  const marketplaceVersion = item.marketplaceVersion || "v1";
  return {
    key: item.listingRecordId || `${marketplaceVersion}:${item.listingId}`,
    id: item.id,
    marketplaceVersion,
    marketplaceLabel: marketplaceVersion.toLowerCase() === "v2" ? "Marketplace V2" : "Marketplace V1",
    marketplaceAddress: (item.marketplaceAddress || null) as Address | null,
    seller: item.sellerAddress as Address,
    nft: item.collectionAddress as Address,
    tokenId: BigInt(item.tokenId),
    amount: BigInt(item.amountRaw || "1"),
    standard: item.standard,
    paymentToken: item.paymentToken as Address,
    price: BigInt(item.priceRaw),
    expiresAt: BigInt(item.expiresAtRaw || "0"),
    active: item.active,
    metadataCid: item.token?.metadataCid || null,
    mediaCid: item.token?.mediaCid || null,
    mintedAt: item.token?.mintedAt || null,
    mintTxHash: item.token?.mintTxHash || null,
    draftName: item.token?.draftName || null,
    draftDescription: item.token?.draftDescription || null,
    ensSubname: item.token?.collection?.ensSubname || null
  };
}

function formatListingAmountLabel(standard: string, amount: bigint): string {
  if (String(standard).toUpperCase() !== "ERC1155") return "1 of 1";
  return `${amount.toString()} edition${amount === 1n ? "" : "s"} listed`;
}

function formatListingExpiresAtLabel(expiresAt: bigint): string {
  if (expiresAt <= 0n) return "Indexed";
  return new Date(Number(expiresAt) * 1000).toLocaleDateString();
}

function getMarketplaceLabel(input: Pick<ListingViewModel, "marketplaceLabel" | "marketplaceVersion">): string {
  const explicit = String(input.marketplaceLabel || "").trim();
  if (explicit) return explicit;
  return String(input.marketplaceVersion || "v1").toLowerCase() === "v2" ? "Marketplace V2" : "Marketplace V1";
}

export function getListingPresentation(
  item: ListingViewModel,
  preview?: { name?: string | null; description?: string | null } | null
): {
  collectionIdentity: string | null;
  title: string;
  description: string;
  marketLabel: string;
  listingLabel: string;
  amountLabel: string;
  priceLabel: string;
  expiresAtLabel: string;
} {
  const collectionIdentity = formatCollectionIdentity(item.ensSubname);
  const marketLabel = getMarketplaceLabel(item);
  return {
    collectionIdentity,
    title: getMintDisplayTitle({
      previewName: preview?.name,
      draftName: item.draftName,
      collectionIdentity,
      tokenId: item.tokenId.toString()
    }),
    description: getMintDisplayDescription({
      previewDescription: preview?.description,
      draftDescription: item.draftDescription,
      collectionIdentity,
      tokenId: item.tokenId.toString()
    }),
    marketLabel,
    listingLabel: `Listing #${item.id} · ${marketLabel}`,
    amountLabel: formatListingAmountLabel(item.standard, item.amount),
    priceLabel: formatListingPrice(item as MarketplaceListing),
    expiresAtLabel: formatListingExpiresAtLabel(item.expiresAt)
  };
}
