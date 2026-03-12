import { describe, expect, it, vi } from "vitest";
import {
  ensureAllowedPaymentToken,
  requireMarketplaceAddress,
  resolveMarketplaceAddress
} from "./marketplacePreflight";

describe("marketplacePreflight", () => {
  it("resolves the marketplace address from config", () => {
    expect(
      resolveMarketplaceAddress({
        marketplace: "0x0000000000000000000000000000000000000001"
      })
    ).toBe("0x0000000000000000000000000000000000000001");

    expect(
      resolveMarketplaceAddress({
        marketplace: null
      })
    ).toBeNull();
  });

  it("throws when a required marketplace address is unavailable", () => {
    expect(() =>
      requireMarketplaceAddress(
        {
          marketplace: null
        },
        {
          missingMessage: "Marketplace address is not configured."
        }
      )
    ).toThrow("Marketplace address is not configured.");
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
