export type Erc1155HoldingLike = {
  standard: string;
  contractAddress: string;
  tokenId: string;
  heldAmountRaw?: string | null;
  reservedAmountRaw?: string | null;
  availableAmountRaw?: string | null;
  mintedAmountRaw?: string | null;
};

export type ActiveListingReservationLike = {
  key?: string | null;
  active?: boolean;
  standard: string;
  nft: string;
  tokenId: bigint | string;
  amount: bigint | string;
};

export type Erc1155ListingAvailability = {
  heldBalance: bigint | null;
  reservedAmount: bigint;
  availableAmount: bigint | null;
  oversubscribed: boolean;
};

export function parsePositiveQuantityRaw(value: string | null | undefined): bigint | null {
  const normalized = String(value || "").trim();
  if (!/^[1-9][0-9]*$/.test(normalized)) return null;
  try {
    return BigInt(normalized);
  } catch {
    return null;
  }
}

function parseNonNegativeQuantityRaw(value: string | null | undefined): bigint | null {
  const normalized = String(value || "").trim();
  if (!/^(0|[1-9][0-9]*)$/.test(normalized)) return null;
  try {
    return BigInt(normalized);
  } catch {
    return null;
  }
}

function normalizeTokenId(value: bigint | string): string | null {
  const normalized = String(value).trim();
  if (!/^[0-9]+$/.test(normalized)) return null;
  try {
    return BigInt(normalized).toString();
  } catch {
    return null;
  }
}

function getErc1155HeldBalance(item: Erc1155HoldingLike): bigint | null {
  if (item.standard.toUpperCase() !== "ERC1155") return null;
  return parsePositiveQuantityRaw(item.heldAmountRaw || item.mintedAmountRaw || null);
}

function getExcludedListingAmount(
  item: Erc1155HoldingLike,
  listings: ActiveListingReservationLike[],
  excludeListingKey: string | null | undefined
): bigint {
  if (!excludeListingKey) return 0n;
  const tokenId = normalizeTokenId(item.tokenId);
  if (tokenId === null) return 0n;
  const normalizedContract = item.contractAddress.toLowerCase();

  for (const listing of listings) {
    if (listing.key !== excludeListingKey) continue;
    if (listing.active === false) continue;
    if (listing.standard.toUpperCase() !== "ERC1155") continue;
    if (listing.nft.toLowerCase() !== normalizedContract) continue;
    if (normalizeTokenId(listing.tokenId) !== tokenId) continue;

    if (typeof listing.amount === "bigint") {
      return listing.amount > 0n ? listing.amount : 0n;
    }
    return parsePositiveQuantityRaw(String(listing.amount)) || 0n;
  }

  return 0n;
}

export function getErc1155ListingAvailability(
  item: Erc1155HoldingLike,
  listings: ActiveListingReservationLike[],
  options?: { excludeListingKey?: string | null }
): Erc1155ListingAvailability {
  const heldBalance = getErc1155HeldBalance(item);
  const precomputedReserved = parseNonNegativeQuantityRaw(item.reservedAmountRaw);
  const precomputedAvailable = parseNonNegativeQuantityRaw(item.availableAmountRaw);
  const excludedAmount = getExcludedListingAmount(item, listings, options?.excludeListingKey);
  if (precomputedReserved !== null) {
    const reservedAmount = precomputedReserved > excludedAmount ? precomputedReserved - excludedAmount : 0n;
    return {
      heldBalance,
      reservedAmount,
      availableAmount:
        heldBalance !== null
          ? heldBalance > reservedAmount
            ? heldBalance - reservedAmount
            : 0n
          : precomputedAvailable !== null
            ? precomputedAvailable + excludedAmount
            : null,
      oversubscribed: heldBalance !== null && reservedAmount > heldBalance
    };
  }
  const tokenId = normalizeTokenId(item.tokenId);
  if (tokenId === null) {
    return {
      heldBalance,
      reservedAmount: 0n,
      availableAmount: heldBalance,
      oversubscribed: false
    };
  }

  const normalizedContract = item.contractAddress.toLowerCase();
  const excludedKey = options?.excludeListingKey || null;
  let reservedAmount = 0n;

  for (const listing of listings) {
    if (listing.active === false) continue;
    if (listing.standard.toUpperCase() !== "ERC1155") continue;
    if (excludedKey && listing.key === excludedKey) continue;
    if (listing.nft.toLowerCase() !== normalizedContract) continue;
    if (normalizeTokenId(listing.tokenId) !== tokenId) continue;

    const amount =
      typeof listing.amount === "bigint"
        ? listing.amount > 0n
          ? listing.amount
          : null
        : parsePositiveQuantityRaw(String(listing.amount));
    if (amount !== null) {
      reservedAmount += amount;
    }
  }

  if (heldBalance === null) {
    return {
      heldBalance,
      reservedAmount,
      availableAmount: null,
      oversubscribed: false
    };
  }

  return {
    heldBalance,
    reservedAmount,
    availableAmount: heldBalance > reservedAmount ? heldBalance - reservedAmount : 0n,
    oversubscribed: reservedAmount > heldBalance
  };
}

export function getSmallestErc1155AvailableBalance(
  items: Erc1155HoldingLike[],
  listings: ActiveListingReservationLike[],
  options?: { excludeListingKey?: string | null }
): bigint | null {
  if (items.length === 0) return null;
  let smallestBalance: bigint | null = null;
  for (const item of items) {
    const availability = getErc1155ListingAvailability(item, listings, options);
    if (availability.availableAmount === null) return null;
    smallestBalance =
      smallestBalance === null || availability.availableAmount < smallestBalance
        ? availability.availableAmount
        : smallestBalance;
  }
  return smallestBalance;
}

export function findInsufficientErc1155Availability(
  items: Erc1155HoldingLike[],
  listings: ActiveListingReservationLike[],
  requestedAmount: bigint,
  options?: { excludeListingKey?: string | null }
): { item: Erc1155HoldingLike; availability: Erc1155ListingAvailability } | null {
  for (const item of items) {
    const availability = getErc1155ListingAvailability(item, listings, options);
    if (availability.availableAmount === null || availability.availableAmount < requestedAmount) {
      return { item, availability };
    }
  }
  return null;
}
