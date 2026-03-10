import { describe, expect, it } from "vitest";
import { toOwnedMintRowFromIndexedToken } from "./ownedMintAdapter";

describe("ownedMintAdapter", () => {
  const config = {
    chainId: 11155111,
    shared721: "0x0000000000000000000000000000000000000721",
    shared1155: "0x0000000000000000000000000000000000001155"
  } as ReturnType<typeof import("./contracts").getContractsConfig>;

  it("maps owner-holdings tokens into list inventory rows", () => {
    expect(
      toOwnedMintRowFromIndexedToken(
        {
          id: "token-1",
          tokenId: "12",
          creatorAddress: "0x00000000000000000000000000000000000000aa",
          ownerAddress: "0x00000000000000000000000000000000000000bb",
          heldAmountRaw: "5",
          reservedAmountRaw: "2",
          availableAmountRaw: "3",
          mintTxHash: "0x1234",
          draftName: "Editions",
          draftDescription: "Owner summary row",
          mintedAmountRaw: "10",
          metadataCid: "ipfs://meta",
          mediaCid: "ipfs://media",
          immutable: true,
          mintedAt: "2026-03-07T00:00:00.000Z",
          collection: {
            chainId: config.chainId,
            contractAddress: "0x00000000000000000000000000000000000000cc",
            ownerAddress: "0x00000000000000000000000000000000000000bb",
            ensSubname: "artist",
            standard: "ERC1155",
            isFactoryCreated: true
          },
          activeListing: {
            listingId: "8",
            listingRecordId: "v2:8",
            marketplaceVersion: "v2",
            marketplaceAddress: "0x00000000000000000000000000000000000000dd",
            sellerAddress: "0x00000000000000000000000000000000000000bb",
            paymentToken: "0x0000000000000000000000000000000000000000",
            priceRaw: "100",
            amountRaw: "2",
            expiresAtRaw: "999",
            active: true
          }
        },
        config
      )
    ).toMatchObject({
      key: "11155111:0x00000000000000000000000000000000000000cc:12",
      chainId: 11155111,
      standard: "ERC1155",
      heldAmountRaw: "5",
      reservedAmountRaw: "2",
      availableAmountRaw: "3",
      draftName: "Editions",
      ensSubname: "artist"
    });
  });

  it("returns null when the indexed token has no usable collection payload", () => {
    expect(
      toOwnedMintRowFromIndexedToken(
        {
          id: "token-2",
          tokenId: "9",
          creatorAddress: "0x00000000000000000000000000000000000000aa",
          ownerAddress: "0x00000000000000000000000000000000000000bb",
          metadataCid: "ipfs://meta",
          mediaCid: null,
          immutable: true,
          mintedAt: "2026-03-07T00:00:00.000Z",
          collection: null,
          activeListing: null
        },
        config
      )
    ).toBeNull();
  });
});
