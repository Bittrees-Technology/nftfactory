import { describe, it, expect } from "vitest";
import { buildBuyPlan } from "./marketplaceBuy";

const ZERO = "0x0000000000000000000000000000000000000000" as const;
const ERC20 = "0x0000000000000000000000000000000000000001" as const;

describe("buildBuyPlan", () => {
  it("returns ETH value and no approvals for ETH listings", () => {
    const plan = buildBuyPlan({
      paymentToken: ZERO,
      zeroAddress: ZERO,
      price: 100n,
      allowance: null
    });
    expect(plan.txValue).toBe(100n);
    expect(plan.approvalAmounts).toEqual([]);
  });

  it("returns no approvals when ERC20 allowance is already sufficient", () => {
    const plan = buildBuyPlan({
      paymentToken: ERC20,
      zeroAddress: ZERO,
      price: 100n,
      allowance: 100n
    });
    expect(plan.txValue).toBeUndefined();
    expect(plan.approvalAmounts).toEqual([]);
  });

  it("returns single approval when ERC20 allowance is zero", () => {
    const plan = buildBuyPlan({
      paymentToken: ERC20,
      zeroAddress: ZERO,
      price: 100n,
      allowance: 0n
    });
    expect(plan.txValue).toBeUndefined();
    expect(plan.approvalAmounts).toEqual([100n]);
  });

  it("returns reset and approval when ERC20 allowance is non-zero but insufficient", () => {
    const plan = buildBuyPlan({
      paymentToken: ERC20,
      zeroAddress: ZERO,
      price: 100n,
      allowance: 10n
    });
    expect(plan.txValue).toBeUndefined();
    expect(plan.approvalAmounts).toEqual([0n, 100n]);
  });

  it("throws when ERC20 allowance is missing", () => {
    expect(() =>
      buildBuyPlan({
        paymentToken: ERC20,
        zeroAddress: ZERO,
        price: 100n,
        allowance: null
      })
    ).toThrow("ERC20 allowance is required for ERC20 buys");
  });
});
