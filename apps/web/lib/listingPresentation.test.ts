import { describe, expect, it } from "vitest";
import { getListingPresentation, type ListingViewModel } from "./listingPresentation";

function listing(overrides: Partial<ListingViewModel> = {}): ListingViewModel {
  return {
    key: "v2:11",
    id: 11,
    seller: "0x0000000000000000000000000000000000000001",
    nft: "0x0000000000000000000000000000000000000002",
    tokenId: 7n,
    amount: 2n,
    standard: "ERC1155",
    paymentToken: "0x0000000000000000000000000000000000000000",
    price: 10n ** 16n,
    expiresAt: 2_000_000_000n,
    active: true,
    draftName: "Edition Seven",
    draftDescription: "Profile storefront edition",
    ensSubname: "artist",
    marketplaceVersion: "v2",
    ...overrides
  };
}

describe("listingPresentation", () => {
  it("formats shared listing titles, descriptions, quantity, and market labels", () => {
    const presentation = getListingPresentation(listing());
    expect(presentation.collectionIdentity).toBe("artist.nftfactory.eth");
    expect(presentation.title).toBe("Edition Seven");
    expect(presentation.description).toBe("Profile storefront edition");
    expect(presentation.marketLabel).toBe("Marketplace V2");
    expect(presentation.listingLabel).toBe("Listing #11 · Marketplace V2");
    expect(presentation.amountLabel).toBe("2 editions listed");
    expect(presentation.priceLabel).toBe("0.01 ETH");
  });

  it("falls back cleanly for ERC721 listings", () => {
    const presentation = getListingPresentation(
      listing({
        id: 5,
        standard: "ERC721",
        amount: 1n,
        draftName: null,
        draftDescription: null,
        ensSubname: null,
        marketplaceVersion: "v1"
      })
    );
    expect(presentation.title).toBe("NFTFactory mint #7");
    expect(presentation.description).toBe("Collection untitled · token #7");
    expect(presentation.marketLabel).toBe("Marketplace V1");
    expect(presentation.amountLabel).toBe("1 of 1");
  });
});
