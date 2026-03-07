import { describe, expect, it } from "vitest";
import {
  findInsufficientErc1155Availability,
  getErc1155ListingAvailability,
  getSmallestErc1155AvailableBalance
} from "./listingAvailability";

describe("getErc1155ListingAvailability", () => {
  it("subtracts active same-token ERC1155 listings from the indexed held balance", () => {
    const availability = getErc1155ListingAvailability(
      {
        standard: "ERC1155",
        contractAddress: "0x00000000000000000000000000000000000000aa",
        tokenId: "7",
        heldAmountRaw: "5"
      },
      [
        {
          key: "v1:11",
          standard: "ERC1155",
          nft: "0x00000000000000000000000000000000000000AA",
          tokenId: 7n,
          amount: 2n,
          active: true
        },
        {
          key: "v2:12",
          standard: "ERC1155",
          nft: "0x00000000000000000000000000000000000000aa",
          tokenId: "8",
          amount: 1n,
          active: true
        },
        {
          key: "v2:13",
          standard: "ERC721",
          nft: "0x00000000000000000000000000000000000000aa",
          tokenId: "7",
          amount: 1n,
          active: true
        }
      ]
    );

    expect(availability.heldBalance).toBe(5n);
    expect(availability.reservedAmount).toBe(2n);
    expect(availability.availableAmount).toBe(3n);
    expect(availability.oversubscribed).toBe(false);
  });

  it("can exclude the current listing when replacing an ERC1155 listing", () => {
    const availability = getErc1155ListingAvailability(
      {
        standard: "ERC1155",
        contractAddress: "0x00000000000000000000000000000000000000aa",
        tokenId: "7",
        heldAmountRaw: "5"
      },
      [
        {
          key: "v1:11",
          standard: "ERC1155",
          nft: "0x00000000000000000000000000000000000000aa",
          tokenId: 7n,
          amount: 2n,
          active: true
        },
        {
          key: "v2:12",
          standard: "ERC1155",
          nft: "0x00000000000000000000000000000000000000aa",
          tokenId: 7n,
          amount: 1n,
          active: true
        }
      ],
      { excludeListingKey: "v1:11" }
    );

    expect(availability.reservedAmount).toBe(1n);
    expect(availability.availableAmount).toBe(4n);
  });

  it("flags oversubscribed balances and floors available amount at zero", () => {
    const availability = getErc1155ListingAvailability(
      {
        standard: "ERC1155",
        contractAddress: "0x00000000000000000000000000000000000000aa",
        tokenId: "7",
        heldAmountRaw: "2"
      },
      [
        {
          key: "v1:11",
          standard: "ERC1155",
          nft: "0x00000000000000000000000000000000000000aa",
          tokenId: 7n,
          amount: 3n,
          active: true
        }
      ]
    );

    expect(availability.reservedAmount).toBe(3n);
    expect(availability.availableAmount).toBe(0n);
    expect(availability.oversubscribed).toBe(true);
  });

  it("prefers precomputed reservation fields from the indexer and adjusts them for replacement mode", () => {
    const availability = getErc1155ListingAvailability(
      {
        standard: "ERC1155",
        contractAddress: "0x00000000000000000000000000000000000000aa",
        tokenId: "7",
        heldAmountRaw: "5",
        reservedAmountRaw: "3",
        availableAmountRaw: "2"
      },
      [
        {
          key: "v2:12",
          standard: "ERC1155",
          nft: "0x00000000000000000000000000000000000000aa",
          tokenId: 7n,
          amount: 2n,
          active: true
        }
      ],
      { excludeListingKey: "v2:12" }
    );

    expect(availability.reservedAmount).toBe(1n);
    expect(availability.availableAmount).toBe(4n);
  });
});

describe("getSmallestErc1155AvailableBalance", () => {
  it("returns the lowest remaining availability across selected tokens", () => {
    const result = getSmallestErc1155AvailableBalance(
      [
        {
          standard: "ERC1155",
          contractAddress: "0x00000000000000000000000000000000000000aa",
          tokenId: "7",
          heldAmountRaw: "5"
        },
        {
          standard: "ERC1155",
          contractAddress: "0x00000000000000000000000000000000000000aa",
          tokenId: "8",
          heldAmountRaw: "2"
        }
      ],
      [
        {
          key: "v2:11",
          standard: "ERC1155",
          nft: "0x00000000000000000000000000000000000000aa",
          tokenId: 7n,
          amount: 1n,
          active: true
        }
      ]
    );

    expect(result).toBe(2n);
  });
});

describe("findInsufficientErc1155Availability", () => {
  it("returns the first token that cannot satisfy the requested listing amount", () => {
    const result = findInsufficientErc1155Availability(
      [
        {
          standard: "ERC1155",
          contractAddress: "0x00000000000000000000000000000000000000aa",
          tokenId: "7",
          heldAmountRaw: "5"
        },
        {
          standard: "ERC1155",
          contractAddress: "0x00000000000000000000000000000000000000aa",
          tokenId: "8",
          heldAmountRaw: "2"
        }
      ],
      [
        {
          key: "v2:11",
          standard: "ERC1155",
          nft: "0x00000000000000000000000000000000000000aa",
          tokenId: 8n,
          amount: 1n,
          active: true
        }
      ],
      2n
    );

    expect(result?.item.tokenId).toBe("8");
    expect(result?.availability.availableAmount).toBe(1n);
  });
});
