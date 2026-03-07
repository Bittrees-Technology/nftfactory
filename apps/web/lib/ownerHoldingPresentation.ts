import {
  formatCollectionIdentity,
  getMintAmountLabel,
  getMintDisplayDescription,
  getMintDisplayTitle,
  getMintStatusLabel
} from "./nftPresentation";

export type OwnerHoldingListingLike = {
  listingId: string;
  paymentToken: string;
  priceRaw: string;
} | null | undefined;

export type OwnerHoldingPresentationInput = {
  standard: string;
  tokenId: string;
  ensSubname?: string | null;
  draftName?: string | null;
  draftDescription?: string | null;
  previewName?: string | null;
  previewDescription?: string | null;
  heldAmountRaw?: string | null;
  reservedAmountRaw?: string | null;
  availableAmountRaw?: string | null;
  mintedAmountRaw?: string | null;
  activeListing?: OwnerHoldingListingLike;
};

export function normalizeOwnerHoldingAmountRaw(value: string | null | undefined): string | null {
  const normalized = String(value || "").trim();
  return /^(0|[1-9][0-9]*)$/.test(normalized) ? normalized : null;
}

export function getOwnerHoldingPresentation(
  input: OwnerHoldingPresentationInput,
  options?: { showZeroReserved?: boolean }
): {
  collectionIdentity: string | null;
  title: string;
  description: string;
  statusLabel: string;
  supplyAmountLabel: string;
  heldAmountLabel: string;
  reservedAmountLabel: string | null;
  availableAmountLabel: string | null;
} {
  const standard = String(input.standard || "").trim().toUpperCase();
  const collectionIdentity = formatCollectionIdentity(input.ensSubname);
  const title = getMintDisplayTitle({
    previewName: input.previewName,
    draftName: input.draftName,
    collectionIdentity,
    tokenId: input.tokenId
  });
  const description = getMintDisplayDescription({
    previewDescription: input.previewDescription,
    draftDescription: input.draftDescription,
    collectionIdentity,
    tokenId: input.tokenId
  });
  const statusLabel = getMintStatusLabel(input.activeListing || null);
  const heldAmountLabel = getMintAmountLabel(
    standard,
    standard === "ERC1155" ? input.heldAmountRaw || input.mintedAmountRaw || null : "1",
    "Balance not indexed"
  );
  const supplyAmountLabel = getMintAmountLabel(standard, input.mintedAmountRaw);
  const reservedAmountRaw = standard === "ERC1155" ? normalizeOwnerHoldingAmountRaw(input.reservedAmountRaw) : null;
  const availableAmountRaw = standard === "ERC1155" ? normalizeOwnerHoldingAmountRaw(input.availableAmountRaw) : null;
  const showZeroReserved = options?.showZeroReserved ?? true;
  const reservedAmountLabel =
    reservedAmountRaw && (showZeroReserved || reservedAmountRaw !== "0")
      ? getMintAmountLabel(standard, reservedAmountRaw, "0 editions")
      : null;
  const availableAmountLabel = availableAmountRaw
    ? getMintAmountLabel(standard, availableAmountRaw, "Balance not indexed")
    : null;

  return {
    collectionIdentity,
    title,
    description,
    statusLabel,
    supplyAmountLabel,
    heldAmountLabel,
    reservedAmountLabel,
    availableAmountLabel
  };
}
