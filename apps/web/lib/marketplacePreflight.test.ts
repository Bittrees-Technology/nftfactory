import { describe, expect, it, vi } from "vitest";
import {
  ensureAllowedPaymentToken,
  requireMarketplaceAddress,
  resolveMarketplaceAddress
} from "./marketplacePreflight";

describe("marketplacePreflight", () => {
  it("resolves the requested marketplace address without falling back to V1", () => {
    expect(
      resolveMarketplaceAddress(
        {
          marketplace: "0x0000000000000000000000000000000000000001",
          marketplaceV2: "0x0000000000000000000000000000000000000002"
        },
        { preferredVersion: "v2" }
      )
    ).toBe("0x0000000000000000000000000000000000000002");

    expect(
      resolveMarketplaceAddress(
        {
          marketplace: "0x0000000000000000000000000000000000000001",
          marketplaceV2: null
        },
        { preferredVersion: "v2" }
      )
    ).toBeNull();
  });

  it("throws when a required marketplace address is unavailable", () => {
    expect(() =>
      requireMarketplaceAddress(
        {
          marketplace: "0x0000000000000000000000000000000000000001",
          marketplaceV2: null
        },
        {
          preferredVersion: "v2",
          missingMessage: "Marketplace V2 address is not configured."
        }
      )
    ).toThrow("Marketplace V2 address is not configured.");
  });

  it("checks the registry allowlist and skips ETH", async () => {
    const publicClient = {
      readContract: vi.fn().mockResolvedValue(true)
    };

    await expect(
      ensureAllowedPaymentToken({
        publicClient: publicClient as never,
        registry: "0x0000000000000000000000000000000000000001",
        paymentToken: "0x0000000000000000000000000000000000000000"
      })
    ).resolves.toBeUndefined();

    await expect(
      ensureAllowedPaymentToken({
        publicClient: publicClient as never,
        registry: "0x0000000000000000000000000000000000000001",
        paymentToken: "0x0000000000000000000000000000000000000002"
      })
    ).resolves.toBeUndefined();

    publicClient.readContract.mockResolvedValueOnce(false);
    await expect(
      ensureAllowedPaymentToken({
        publicClient: publicClient as never,
        registry: "0x0000000000000000000000000000000000000001",
        paymentToken: "0x0000000000000000000000000000000000000002"
      })
    ).rejects.toThrow("This ERC20 is not allowed in the registry. Use an allowlisted payment token or ETH.");
  });
});
