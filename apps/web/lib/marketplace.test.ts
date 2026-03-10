import { describe, expect, it, vi } from "vitest";
import {
  formatListingPrice,
  formatOfferPrice,
  readPaymentTokenAllowed,
  readRegistryOwner,
  ZERO_ADDRESS,
  type MarketplaceListing,
  type MarketplaceOffer
} from "./marketplace";

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

function offer(overrides: Partial<MarketplaceOffer>): MarketplaceOffer {
  return {
    id: 1,
    buyer: "0x0000000000000000000000000000000000000001",
    nft: "0x0000000000000000000000000000000000000002",
    tokenId: 1n,
    quantity: 1n,
    standard: "ERC721",
    paymentToken: ZERO_ADDRESS,
    price: 10n ** 18n,
    expiresAt: 9999999999n,
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

describe("formatOfferPrice", () => {
  it("formats ETH offers with ether units", () => {
    expect(formatOfferPrice(offer({ paymentToken: ZERO_ADDRESS, price: 2n * 10n ** 18n }))).toBe("2 ETH");
  });
});

describe("readPaymentTokenAllowed", () => {
  it("treats ETH as implicitly allowed without a registry read", async () => {
    const readContract = vi.fn();
    const publicClient = { readContract } as any;

    await expect(
      readPaymentTokenAllowed(
        publicClient,
        "0x0000000000000000000000000000000000000001",
        ZERO_ADDRESS
      )
    ).resolves.toBe(true);
    expect(readContract).not.toHaveBeenCalled();
  });

  it("reads the registry allowlist for ERC20 tokens", async () => {
    const readContract = vi.fn(async () => true);
    const publicClient = { readContract } as any;
    const registry = "0x0000000000000000000000000000000000000001";
    const token = "0x0000000000000000000000000000000000000003";

    await expect(readPaymentTokenAllowed(publicClient, registry, token)).resolves.toBe(true);
    expect(readContract).toHaveBeenCalledWith({
      address: registry,
      abi: expect.any(Array),
      functionName: "allowedPaymentToken",
      args: [token]
    });
  });
});

describe("readRegistryOwner", () => {
  it("reads the registry owner", async () => {
    const owner = "0x0000000000000000000000000000000000000009";
    const readContract = vi.fn(async () => owner);
    const publicClient = { readContract } as any;
    const registry = "0x0000000000000000000000000000000000000001";

    await expect(readRegistryOwner(publicClient, registry)).resolves.toBe(owner);
    expect(readContract).toHaveBeenCalledWith({
      address: registry,
      abi: expect.any(Array),
      functionName: "owner"
    });
  });
});
