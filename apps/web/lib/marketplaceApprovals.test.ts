import { describe, expect, it, vi } from "vitest";
import { ensureCollectionApprovalForAll, ensureErc20SpendApproval } from "./marketplaceApprovals";

describe("marketplaceApprovals", () => {
  it("skips ERC20 approvals for ETH", async () => {
    const result = await ensureErc20SpendApproval({
      walletClient: {
        account: { address: "0x0000000000000000000000000000000000000001" },
        sendTransaction: vi.fn()
      },
      publicClient: {
        readContract: vi.fn(),
        waitForTransactionReceipt: vi.fn()
      },
      tokenAddress: "0x0000000000000000000000000000000000000000",
      spender: "0x0000000000000000000000000000000000000002",
      requiredAmount: 1n,
      zeroAddress: "0x0000000000000000000000000000000000000000"
    });

    expect(result).toEqual([]);
  });

  it("sends reset-and-approve ERC20 transactions when allowance is insufficient", async () => {
    const sendTransaction = vi
      .fn()
      .mockResolvedValueOnce("0xaaa")
      .mockResolvedValueOnce("0xbbb");
    const waitForTransactionReceipt = vi.fn().mockResolvedValue(undefined);
    const readContract = vi.fn().mockResolvedValue(10n);

    const result = await ensureErc20SpendApproval({
      walletClient: {
        account: { address: "0x0000000000000000000000000000000000000001" },
        sendTransaction
      },
      publicClient: {
        readContract,
        waitForTransactionReceipt
      },
      tokenAddress: "0x0000000000000000000000000000000000000010",
      spender: "0x0000000000000000000000000000000000000020",
      requiredAmount: 100n,
      zeroAddress: "0x0000000000000000000000000000000000000000"
    });

    expect(readContract).toHaveBeenCalledOnce();
    expect(sendTransaction).toHaveBeenCalledTimes(2);
    expect(waitForTransactionReceipt).toHaveBeenCalledTimes(2);
    expect(result).toEqual(["0xaaa", "0xbbb"]);
  });

  it("skips setApprovalForAll when already approved", async () => {
    const sendTransaction = vi.fn();
    const result = await ensureCollectionApprovalForAll({
      walletClient: {
        account: { address: "0x0000000000000000000000000000000000000001" },
        sendTransaction
      },
      publicClient: {
        readContract: vi.fn().mockResolvedValue(true),
        waitForTransactionReceipt: vi.fn()
      },
      nftAddress: "0x0000000000000000000000000000000000000100",
      ownerAddress: "0x0000000000000000000000000000000000000001",
      operator: "0x0000000000000000000000000000000000000200"
    });

    expect(result).toBeNull();
    expect(sendTransaction).not.toHaveBeenCalled();
  });
});
