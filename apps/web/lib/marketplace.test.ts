import { describe, expect, it } from "vitest";
import { formatListingPrice, ZERO_ADDRESS, type MarketplaceListing } from "./marketplace";

function listing(overrides: Partial<MarketplaceListing>): MarketplaceListing {
  return {
    id: 1,
    seller: "0x0000000000000000000000000000000000000001",
    nft: "0x0000000000000000000000000000000000000002",
    tokenId: 1n,
    amount: 1n,
    standard: "ERC721",
    paymentToken: ZERO_ADDRESS,
    price: 10n ** 18n,
    active: true,
    ...overrides
  };
}

describe("formatListingPrice", () => {
  it("formats ETH listings with ether units", () => {
    expect(formatListingPrice(listing({ paymentToken: ZERO_ADDRESS, price: 10n ** 18n }))).toBe("1 ETH");
  });

  it("formats ERC20 listings as raw units to avoid decimals mismatch", () => {
    expect(
      formatListingPrice(
        listing({
          paymentToken: "0x0000000000000000000000000000000000000003",
          price: 1_500_000n
        })
      )
    ).toBe("1500000 raw ERC20 units");
  });
});
