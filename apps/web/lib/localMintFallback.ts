type MintFallbackFields = {
  creatorAddress?: string | null;
  ownerAddress?: string | null;
  currentOwnerAddress?: string | null;
  currentOwnerAddresses?: string[] | null;
  heldAmountRaw?: string | null;
  reservedAmountRaw?: string | null;
  availableAmountRaw?: string | null;
  mintTxHash?: string | null;
  draftName?: string | null;
  draftDescription?: string | null;
  mintedAmountRaw?: string | null;
  metadataCid?: string | null;
  mediaCid?: string | null;
  mintedAt?: string | null;
  activeListing?: unknown | null;
  ensSubname?: string | null;
};

function nonEmptyString(value: string | null | undefined): string | null {
  const normalized = String(value || "").trim();
  return normalized ? normalized : null;
}

function nonEmptyStringArray(values: string[] | null | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return values.map((value) => String(value || "").trim()).filter(Boolean);
}

export function mergeLocalMintFallback<T extends MintFallbackFields>(indexed: T, local: Partial<T>): T {
  const indexedOwnerAddresses = nonEmptyStringArray(indexed.currentOwnerAddresses);
  const localOwnerAddresses = nonEmptyStringArray(local.currentOwnerAddresses);

  return {
    ...indexed,
    creatorAddress: nonEmptyString(indexed.creatorAddress) || nonEmptyString(local.creatorAddress),
    ownerAddress: nonEmptyString(indexed.ownerAddress) || nonEmptyString(local.ownerAddress),
    currentOwnerAddress: nonEmptyString(indexed.currentOwnerAddress) || nonEmptyString(local.currentOwnerAddress),
    currentOwnerAddresses: indexedOwnerAddresses.length > 0 ? indexedOwnerAddresses : localOwnerAddresses,
    heldAmountRaw: nonEmptyString(indexed.heldAmountRaw) || nonEmptyString(local.heldAmountRaw),
    reservedAmountRaw: nonEmptyString(indexed.reservedAmountRaw) || nonEmptyString(local.reservedAmountRaw),
    availableAmountRaw: nonEmptyString(indexed.availableAmountRaw) || nonEmptyString(local.availableAmountRaw),
    mintTxHash: nonEmptyString(indexed.mintTxHash) || nonEmptyString(local.mintTxHash),
    draftName: nonEmptyString(indexed.draftName) || nonEmptyString(local.draftName),
    draftDescription: nonEmptyString(indexed.draftDescription) || nonEmptyString(local.draftDescription),
    mintedAmountRaw: nonEmptyString(indexed.mintedAmountRaw) || nonEmptyString(local.mintedAmountRaw),
    metadataCid: nonEmptyString(indexed.metadataCid) || nonEmptyString(local.metadataCid),
    mediaCid: nonEmptyString(indexed.mediaCid) || nonEmptyString(local.mediaCid),
    mintedAt: nonEmptyString(indexed.mintedAt) || nonEmptyString(local.mintedAt),
    activeListing: indexed.activeListing || local.activeListing || null,
    ensSubname: nonEmptyString(indexed.ensSubname) || nonEmptyString(local.ensSubname)
  } as T;
}
