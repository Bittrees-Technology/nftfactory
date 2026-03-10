import { getContractsConfig } from "./contracts";
import type { ApiMintFeedItem, ApiOwnerHoldingsResponse } from "./indexerApi";

type Config = ReturnType<typeof getContractsConfig>;

export type OwnedMintRow = {
  key: string;
  chainId: number;
  tokenId: string;
  contractAddress: string;
  standard: "ERC721" | "ERC1155";
  source: "shared" | "custom";
  ownerAddress: string;
  creatorAddress: string;
  ensSubname: string | null;
  mintTxHash: string | null;
  heldAmountRaw?: string | null;
  reservedAmountRaw?: string | null;
  availableAmountRaw?: string | null;
  draftName?: string | null;
  draftDescription?: string | null;
  mintedAmountRaw?: string | null;
  metadataCid: string;
  mediaCid: string | null;
  mintedAt: string;
  activeListing: {
    listingId: string;
    paymentToken: string;
    priceRaw: string;
  } | null;
};

type OwnedMintApiToken = ApiMintFeedItem | ApiOwnerHoldingsResponse["items"][number];

function getOwnedMintSource(
  contractAddress: string,
  config: Config
): "shared" | "custom" {
  const normalizedContract = contractAddress.toLowerCase();
  return normalizedContract === config.shared721.toLowerCase() || normalizedContract === config.shared1155.toLowerCase()
    ? "shared"
    : "custom";
}

export function createOwnedMintRow(
  params: {
    tokenId: string;
    chainId?: number;
    contractAddress: string;
    standard: string;
    ownerAddress: string;
    creatorAddress: string;
    heldAmountRaw?: string | null;
    reservedAmountRaw?: string | null;
    availableAmountRaw?: string | null;
    ensSubname?: string | null;
    mintTxHash?: string | null;
    draftName?: string | null;
    draftDescription?: string | null;
    mintedAmountRaw?: string | null;
    metadataCid: string;
    mediaCid: string | null;
    mintedAt: string;
    activeListing?: {
      listingId: string;
      paymentToken: string;
      priceRaw: string;
    } | null;
  },
  config: Config
): OwnedMintRow {
  const standard = params.standard === "ERC1155" ? "ERC1155" : "ERC721";
  const chainId = params.chainId || config.chainId;
  return {
    key: `${chainId}:${params.contractAddress.toLowerCase()}:${params.tokenId}`,
    chainId,
    tokenId: params.tokenId,
    contractAddress: params.contractAddress,
    standard,
    source: getOwnedMintSource(params.contractAddress, config),
    ownerAddress: params.ownerAddress,
    creatorAddress: params.creatorAddress,
    heldAmountRaw: standard === "ERC1155" ? params.heldAmountRaw || params.mintedAmountRaw || null : "1",
    reservedAmountRaw: standard === "ERC1155" ? params.reservedAmountRaw || null : params.activeListing ? "1" : "0",
    availableAmountRaw:
      standard === "ERC1155"
        ? params.availableAmountRaw || params.heldAmountRaw || params.mintedAmountRaw || null
        : params.activeListing
          ? "0"
          : "1",
    ensSubname: params.ensSubname || null,
    mintTxHash: params.mintTxHash || null,
    draftName: params.draftName || null,
    draftDescription: params.draftDescription || null,
    mintedAmountRaw: params.mintedAmountRaw || (standard === "ERC1155" ? null : "1"),
    metadataCid: params.metadataCid,
    mediaCid: params.mediaCid,
    mintedAt: params.mintedAt,
    activeListing: params.activeListing || null
  };
}

export function toOwnedMintRowFromIndexedToken(
  token: OwnedMintApiToken,
  config: Config
): OwnedMintRow | null {
  if (!token.collection || (token.collection.standard !== "ERC1155" && token.collection.standard !== "ERC721")) {
    return null;
  }

  return createOwnedMintRow(
    {
      tokenId: token.tokenId,
      chainId: token.collection.chainId || config.chainId,
      contractAddress: token.collection.contractAddress,
      standard: token.collection.standard,
      ownerAddress: token.ownerAddress,
      creatorAddress: token.creatorAddress,
      heldAmountRaw: token.heldAmountRaw || token.mintedAmountRaw || null,
      reservedAmountRaw: token.reservedAmountRaw || null,
      availableAmountRaw: token.availableAmountRaw || token.heldAmountRaw || token.mintedAmountRaw || null,
      ensSubname: token.collection.ensSubname,
      mintTxHash: token.mintTxHash || null,
      draftName: token.draftName || null,
      draftDescription: token.draftDescription || null,
      mintedAmountRaw: token.mintedAmountRaw || null,
      metadataCid: token.metadataCid,
      mediaCid: token.mediaCid,
      mintedAt: token.mintedAt,
      activeListing: token.activeListing
        ? {
            listingId: token.activeListing.listingId,
            paymentToken: token.activeListing.paymentToken,
            priceRaw: token.activeListing.priceRaw
          }
        : null
    },
    config
  );
}
