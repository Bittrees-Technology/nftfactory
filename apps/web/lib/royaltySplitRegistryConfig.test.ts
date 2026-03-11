import { describe, expect, it } from "vitest";
import {
  formatRoyaltySplitRegistryMissingMessage,
  getRoyaltySplitRegistryEnvHint
} from "./royaltySplitRegistryConfig";

describe("royaltySplitRegistryConfig", () => {
  it("builds a chain-scoped hint without a legacy alias", () => {
    expect(getRoyaltySplitRegistryEnvHint(8453, false)).toEqual({
      chainId: 8453,
      scopedEnvVarName: "NEXT_PUBLIC_ROYALTY_SPLIT_REGISTRY_ADDRESS_8453",
      legacyEnvVarName: undefined
    });
  });

  it("includes the legacy alias for the primary-chain path", () => {
    expect(getRoyaltySplitRegistryEnvHint(1, true)).toEqual({
      chainId: 1,
      scopedEnvVarName: "NEXT_PUBLIC_ROYALTY_SPLIT_REGISTRY_ADDRESS_1",
      legacyEnvVarName: "NEXT_PUBLIC_ROYALTY_SPLIT_REGISTRY_ADDRESS"
    });
  });

  it("formats a missing-config message with both env options when available", () => {
    const message = formatRoyaltySplitRegistryMissingMessage(
      "Ethereum",
      getRoyaltySplitRegistryEnvHint(1, true)
    );

    expect(message).toContain("Royalty split registry is not configured for Ethereum.");
    expect(message).toContain("NEXT_PUBLIC_ROYALTY_SPLIT_REGISTRY_ADDRESS_1");
    expect(message).toContain("NEXT_PUBLIC_ROYALTY_SPLIT_REGISTRY_ADDRESS");
  });

  it("formats a chain-scoped missing-config message when only the scoped env is valid", () => {
    const message = formatRoyaltySplitRegistryMissingMessage(
      "Base",
      getRoyaltySplitRegistryEnvHint(8453, false)
    );

    expect(message).toContain("Royalty split registry is not configured for Base.");
    expect(message).toContain("NEXT_PUBLIC_ROYALTY_SPLIT_REGISTRY_ADDRESS_8453");
    expect(message).not.toContain("legacy primary-chain alias");
  });
});
