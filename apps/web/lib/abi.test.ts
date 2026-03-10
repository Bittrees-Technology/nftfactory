import { describe, it, expect } from "vitest";
import {
  toWeiBigInt,
  toHexWei,
  hexToBigInt,
  truncateHash,
  encodeSetApprovalForAll,
  encodeSetPaymentTokenAllowed,
  encodeSetModerator,
  encodeErc20Approve,
  encodeCancelListing,
  encodeBuyListing,
  encodeRegisterSubname,
  encodeCreateOffer,
  encodeCancelOffer,
  encodeAcceptOffer
} from "./abi";

describe("toWeiBigInt", () => {
  it("converts 1 ETH", () => {
    expect(toWeiBigInt("1")).toBe(1000000000000000000n);
  });

  it("converts 0.01 ETH", () => {
    expect(toWeiBigInt("0.01")).toBe(10000000000000000n);
  });

  it("converts 0 ETH", () => {
    expect(toWeiBigInt("0")).toBe(0n);
  });

  it("converts with leading decimal", () => {
    expect(toWeiBigInt(".5")).toBe(500000000000000000n);
  });

  it("handles 18 decimal places", () => {
    expect(toWeiBigInt("0.000000000000000001")).toBe(1n);
  });

  it("truncates beyond 18 decimal places", () => {
    expect(toWeiBigInt("0.0000000000000000019")).toBe(1n);
  });

  it("throws for non-numeric input", () => {
    expect(() => toWeiBigInt("abc")).toThrow("Invalid ETH amount");
  });

  it("handles whitespace", () => {
    expect(toWeiBigInt("  1  ")).toBe(1000000000000000000n);
  });
});

describe("toHexWei", () => {
  it("converts 1 ETH to hex", () => {
    const result = toHexWei("1");
    expect(result).toBe("0x" + (10n ** 18n).toString(16));
  });

  it("converts 0 ETH", () => {
    expect(toHexWei("0")).toBe("0x0");
  });
});

describe("hexToBigInt", () => {
  it("converts hex with 0x prefix", () => {
    expect(hexToBigInt("0xa")).toBe(10n);
  });

  it("converts hex without 0x prefix", () => {
    expect(hexToBigInt("ff")).toBe(255n);
  });

  it("converts zero", () => {
    expect(hexToBigInt("0x0")).toBe(0n);
  });
});

describe("truncateHash", () => {
  it("truncates a long hash", () => {
    const hash = "0x1234567890abcdef1234567890abcdef12345678";
    const result = truncateHash(hash);
    expect(result).toBe("0x123456...345678");
  });

  it("returns short strings unchanged", () => {
    expect(truncateHash("0x12345")).toBe("0x12345");
  });
});

describe("encodeSetApprovalForAll", () => {
  it("starts with correct selector", () => {
    const result = encodeSetApprovalForAll("0x0000000000000000000000000000000000000001", true);
    expect(result.startsWith("0xa22cb465")).toBe(true);
  });

  it("has correct length (selector + 2 words)", () => {
    const result = encodeSetApprovalForAll("0x0000000000000000000000000000000000000001", true);
    // 0x + 8 (selector) + 64 (address) + 64 (bool) = 138 chars
    expect(result.length).toBe(2 + 8 + 64 + 64);
  });
});

describe("encodeCancelListing", () => {
  it("starts with correct selector", () => {
    const result = encodeCancelListing(42n);
    expect(result.startsWith("0x305a67a8")).toBe(true);
  });

  it("encodes listing ID correctly", () => {
    const result = encodeCancelListing(1n);
    // Selector + uint256 padded to 64 hex chars
    expect(result).toBe("0x305a67a8" + "0".repeat(63) + "1");
  });
});

describe("encodeErc20Approve", () => {
  it("starts with correct selector", () => {
    const result = encodeErc20Approve("0x0000000000000000000000000000000000000001", 1n);
    expect(result.startsWith("0x095ea7b3")).toBe(true);
  });

  it("has correct length (selector + 2 words)", () => {
    const result = encodeErc20Approve("0x0000000000000000000000000000000000000001", 42n);
    expect(result.length).toBe(2 + 8 + 64 + 64);
  });
});

describe("encodeSetPaymentTokenAllowed", () => {
  it("starts with correct selector", () => {
    const result = encodeSetPaymentTokenAllowed("0x0000000000000000000000000000000000000001", true);
    expect(result.startsWith("0x28336098")).toBe(true);
  });

  it("has correct length (selector + 2 words)", () => {
    const result = encodeSetPaymentTokenAllowed("0x0000000000000000000000000000000000000001", false);
    expect(result.length).toBe(2 + 8 + 64 + 64);
  });
});

describe("encodeSetModerator", () => {
  it("starts with correct selector", () => {
    const result = encodeSetModerator("0x0000000000000000000000000000000000000001", "Core Mod", true);
    expect(result.startsWith("0x01ec709d")).toBe(true);
  });

  it("encodes dynamic string payloads", () => {
    const result = encodeSetModerator("0x0000000000000000000000000000000000000001", "Core Mod", false);
    expect(result.length).toBeGreaterThan(2 + 8 + 64 + 64 + 64);
  });
});

describe("encodeBuyListing", () => {
  it("starts with correct selector", () => {
    const result = encodeBuyListing(1n);
    expect(result.startsWith("0xd96a094a")).toBe(true);
  });
});

describe("encodeCreateOffer", () => {
  it("starts with the V2 selector", () => {
    const result = encodeCreateOffer(
      "0x0000000000000000000000000000000000000001",
      7n,
      2n,
      "ERC1155",
      "0x0000000000000000000000000000000000000002",
      42n,
      14n
    );
    expect(result.startsWith("0x6ae3f097")).toBe(true);
  });
});

describe("encodeCancelOffer", () => {
  it("starts with correct selector", () => {
    const result = encodeCancelOffer(42n);
    expect(result.startsWith("0xef706adf")).toBe(true);
  });
});

describe("encodeAcceptOffer", () => {
  it("starts with correct selector", () => {
    const result = encodeAcceptOffer(42n);
    expect(result.startsWith("0xc815729d")).toBe(true);
  });
});

describe("encodeRegisterSubname", () => {
  it("starts with correct selector", () => {
    const result = encodeRegisterSubname("alice");
    expect(result.startsWith("0x8e78d578")).toBe(true);
  });
});
