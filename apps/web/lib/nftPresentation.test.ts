import { describe, expect, it } from "vitest";
import {
  formatCollectionIdentity,
  getMintAmountLabel,
  getMintDisplayDescription,
  getMintDisplayTitle,
  getMintStatusLabel
} from "./nftPresentation";

describe("nftPresentation", () => {
  it("formats nftfactory subnames into full identities", () => {
    expect(formatCollectionIdentity("artist")).toBe("artist.nftfactory.eth");
    expect(formatCollectionIdentity("artist.nftfactory.eth")).toBe("artist.nftfactory.eth");
    expect(formatCollectionIdentity("")).toBeNull();
  });

  it("prefers preview and draft data before generic mint fallbacks", () => {
    expect(
      getMintDisplayTitle({
        previewName: "Preview title",
        draftName: "Draft title",
        collectionIdentity: "artist.nftfactory.eth",
        tokenId: "7"
      })
    ).toBe("Preview title");
    expect(
      getMintDisplayDescription({
        previewDescription: "",
        draftDescription: "Draft description",
        collectionIdentity: "artist.nftfactory.eth",
        tokenId: "7"
      })
    ).toBe("Draft description");
    expect(
      getMintDisplayTitle({
        previewName: "",
        draftName: "",
        collectionIdentity: "artist.nftfactory.eth",
        tokenId: "7"
      })
    ).toBe("artist.nftfactory.eth");
  });

  it("builds listing status and amount labels", () => {
    expect(getMintStatusLabel(null)).toBe("Ready to list");
    expect(
      getMintStatusLabel({
        listingId: "9",
        paymentToken: "0x0000000000000000000000000000000000000000",
        priceRaw: "10000000000000000"
      })
    ).toBe("0.01 ETH");
    expect(getMintAmountLabel("ERC721")).toBe("1 of 1");
    expect(getMintAmountLabel("ERC1155", "3")).toBe("3 editions minted");
    expect(getMintAmountLabel("ERC1155", null, "Choose quantity when listing")).toBe("Choose quantity when listing");
  });
});
