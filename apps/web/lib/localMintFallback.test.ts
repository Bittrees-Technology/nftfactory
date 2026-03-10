import { describe, expect, it } from "vitest";
import { mergeLocalMintFallback } from "./localMintFallback";

describe("mergeLocalMintFallback", () => {
  it("preserves indexed values and only fills missing fields from local cache", () => {
    expect(
      mergeLocalMintFallback(
        {
          ownerAddress: "0x1111",
          draftName: "Indexed Name",
          draftDescription: null,
          heldAmountRaw: "2",
          reservedAmountRaw: null,
          availableAmountRaw: null,
          mintedAmountRaw: null,
          currentOwnerAddresses: ["0x1111"],
          activeListing: { listingId: "7" },
          ensSubname: null
        },
        {
          ownerAddress: "0x2222",
          draftName: "Local Name",
          draftDescription: "Local Description",
          heldAmountRaw: "9",
          reservedAmountRaw: "1",
          availableAmountRaw: "8",
          mintedAmountRaw: "10",
          currentOwnerAddresses: ["0x3333"],
          activeListing: null,
          ensSubname: "artist"
        }
      )
    ).toMatchObject({
      ownerAddress: "0x1111",
      draftName: "Indexed Name",
      draftDescription: "Local Description",
      heldAmountRaw: "2",
      reservedAmountRaw: "1",
      availableAmountRaw: "8",
      mintedAmountRaw: "10",
      currentOwnerAddresses: ["0x1111"],
      activeListing: { listingId: "7" },
      ensSubname: "artist"
    });
  });

  it("uses local cache when indexed values are missing entirely", () => {
    expect(
      mergeLocalMintFallback(
        {
          ownerAddress: "",
          currentOwnerAddress: null,
          currentOwnerAddresses: [],
          draftName: null,
          metadataCid: "",
          mintedAt: ""
        },
        {
          ownerAddress: "0xaaaa",
          currentOwnerAddress: "0xbbbb",
          currentOwnerAddresses: ["0xcccc"],
          draftName: "Local Draft",
          metadataCid: "ipfs://meta",
          mintedAt: "2026-03-07T00:00:00.000Z"
        }
      )
    ).toMatchObject({
      ownerAddress: "0xaaaa",
      currentOwnerAddress: "0xbbbb",
      currentOwnerAddresses: ["0xcccc"],
      draftName: "Local Draft",
      metadataCid: "ipfs://meta",
      mintedAt: "2026-03-07T00:00:00.000Z"
    });
  });
});
