import { describe, expect, it } from "vitest";
import { getOwnerHoldingPresentation } from "./ownerHoldingPresentation";

describe("ownerHoldingPresentation", () => {
  it("reuses shared fallback rules for owner-scoped titles and balance labels", () => {
    const presentation = getOwnerHoldingPresentation({
      standard: "ERC1155",
      tokenId: "7",
      ensSubname: "artist",
      draftName: "Edition Seven",
      draftDescription: "Held through indexed balances",
      heldAmountRaw: "2",
      reservedAmountRaw: "1",
      availableAmountRaw: "1",
      mintedAmountRaw: "25",
      activeListing: {
        listingId: "11",
        paymentToken: "0x0000000000000000000000000000000000000000",
        priceRaw: "10000000000000000"
      }
    });

    expect(presentation.collectionIdentity).toBe("artist.nftfactory.eth");
    expect(presentation.title).toBe("Edition Seven");
    expect(presentation.description).toBe("Held through indexed balances");
    expect(presentation.statusLabel).toBe("0.01 ETH");
    expect(presentation.supplyAmountLabel).toBe("25 editions minted");
    expect(presentation.heldAmountLabel).toBe("2 editions minted");
    expect(presentation.reservedAmountLabel).toBe("1 edition minted");
    expect(presentation.availableAmountLabel).toBe("1 edition minted");
  });

  it("can hide zero reserved labels while keeping available balance visible", () => {
    const presentation = getOwnerHoldingPresentation(
      {
        standard: "ERC1155",
        tokenId: "7",
        heldAmountRaw: "2",
        reservedAmountRaw: "0",
        availableAmountRaw: "2",
        mintedAmountRaw: "25"
      },
      { showZeroReserved: false }
    );

    expect(presentation.reservedAmountLabel).toBeNull();
    expect(presentation.availableAmountLabel).toBe("2 editions minted");
  });
});
