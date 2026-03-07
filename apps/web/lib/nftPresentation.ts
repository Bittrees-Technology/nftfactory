import { formatEther } from "viem";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function formatCollectionIdentity(ensSubname: string | null | undefined): string | null {
  const value = String(ensSubname || "").trim();
  if (!value) return null;
  return value.includes(".") ? value : `${value}.nftfactory.eth`;
}

export function getMintSourceLabel(isFactoryCreated: boolean): string {
  return isFactoryCreated ? "NFTFactory shared mint" : "Creator collection mint";
}

export function getMintStatusLabel(activeListing: {
  listingId: string;
  paymentToken: string;
  priceRaw: string;
} | null): string {
  if (!activeListing) return "Ready to list";
  if (activeListing.paymentToken.toLowerCase() === ZERO_ADDRESS) {
    return `${formatEther(BigInt(activeListing.priceRaw))} ETH`;
  }
  return `Listed #${activeListing.listingId} (ERC20)`;
}

export function getMintDisplayTitle(params: {
  previewName?: string | null;
  draftName?: string | null;
  collectionIdentity?: string | null;
  tokenId: string;
}): string {
  const previewName = String(params.previewName || "").trim();
  if (previewName) return previewName;
  const draftName = String(params.draftName || "").trim();
  if (draftName) return draftName;
  return `${params.collectionIdentity || "NFTFactory mint"} #${params.tokenId}`;
}

export function getMintDisplayDescription(params: {
  previewDescription?: string | null;
  draftDescription?: string | null;
  collectionIdentity?: string | null;
  tokenId: string;
}): string {
  const previewDescription = String(params.previewDescription || "").trim();
  if (previewDescription) return previewDescription;
  const draftDescription = String(params.draftDescription || "").trim();
  if (draftDescription) return draftDescription;
  return `Collection ${params.collectionIdentity || "untitled"} · token #${params.tokenId}`;
}

export function getMintAmountLabel(
  standard: string,
  mintedAmountRaw?: string | null,
  missingErc1155Label = "Edition size not indexed"
): string {
  if (String(standard).toUpperCase() !== "ERC1155") return "1 of 1";
  const normalized = String(mintedAmountRaw || "").trim();
  if (/^[1-9][0-9]*$/.test(normalized)) {
    return `${normalized} edition${normalized === "1" ? "" : "s"} minted`;
  }
  return missingErc1155Label;
}
