import type { Address } from "viem";
import { truncateAddress, type MarketplaceOffer } from "../../lib/marketplace";

export function isProfileOfferAddress(value: string): value is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export function formatOfferUnixTimestamp(value: bigint): string {
  const timestamp = Number(value) * 1000;
  if (!Number.isFinite(timestamp)) return value.toString();
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? value.toString() : date.toLocaleString();
}

export function formatOfferAddressList(addresses: Address[]): string {
  if (addresses.length === 0) return "Owner not resolved";
  return addresses.map((item) => truncateAddress(item)).join(", ");
}

export function parsePositiveQuantityRaw(value: string | null | undefined): bigint | null {
  const normalized = String(value || "").trim();
  if (!/^[1-9][0-9]*$/.test(normalized)) return null;
  try {
    return BigInt(normalized);
  } catch {
    return null;
  }
}

export function holdingBalanceKey(ownerAddress: string, nft: Address, tokenId: bigint): string {
  return `${ownerAddress.toLowerCase()}:${nft.toLowerCase()}:${tokenId.toString()}`;
}

export function formatEditionBalance(value: bigint): string {
  return `${value.toString()} edition${value === 1n ? "" : "s"}`;
}

export function getOfferRecipients(
  offer: MarketplaceOffer,
  resolvedRecipients: Record<number, Address[]>
): Address[] {
  const recipients = [...(offer.indexedRecipients || []), ...(resolvedRecipients[offer.id] || [])];
  const unique = new Map<string, Address>();
  for (const recipient of recipients) {
    unique.set(recipient.toLowerCase(), recipient);
  }
  return [...unique.values()];
}

export function getOfferRecipientBalance(
  offer: MarketplaceOffer,
  recipient: Address | string | null | undefined,
  balances: Record<string, string>
): bigint | null {
  const normalizedRecipient = String(recipient || "").trim().toLowerCase();
  if (!isProfileOfferAddress(normalizedRecipient) || offer.standard.toUpperCase() !== "ERC1155") {
    return offer.standard.toUpperCase() === "ERC721" && isProfileOfferAddress(normalizedRecipient) ? 1n : null;
  }
  return parsePositiveQuantityRaw(balances[holdingBalanceKey(normalizedRecipient, offer.nft, offer.tokenId)] || null);
}

export function formatOfferRecipientBalances(
  offer: MarketplaceOffer,
  recipients: Address[],
  balances: Record<string, string>
): string | null {
  if (offer.standard.toUpperCase() !== "ERC1155") return null;
  const parts = recipients
    .map((recipient) => {
      const balance = getOfferRecipientBalance(offer, recipient, balances);
      return balance === null ? null : `${truncateAddress(recipient)} (${balance.toString()})`;
    })
    .filter((entry): entry is string => Boolean(entry));
  return parts.length > 0 ? parts.join(", ") : null;
}
