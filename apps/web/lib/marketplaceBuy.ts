export type BuyPlan = {
  txValue: bigint | undefined;
  approvalAmounts: bigint[];
};

export function buildBuyPlan(params: {
  paymentToken: `0x${string}`;
  zeroAddress: `0x${string}`;
  price: bigint;
  allowance: bigint | null;
}): BuyPlan {
  const { paymentToken, zeroAddress, price, allowance } = params;

  if (paymentToken.toLowerCase() === zeroAddress.toLowerCase()) {
    return {
      txValue: price,
      approvalAmounts: []
    };
  }

  if (allowance === null) {
    throw new Error("ERC20 allowance is required for ERC20 buys");
  }

  if (allowance >= price) {
    return {
      txValue: undefined,
      approvalAmounts: []
    };
  }

  if (allowance === 0n) {
    return {
      txValue: undefined,
      approvalAmounts: [price]
    };
  }

  return {
    txValue: undefined,
    approvalAmounts: [0n, price]
  };
}
