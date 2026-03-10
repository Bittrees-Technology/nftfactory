import { describe, expect, it, vi } from "vitest";
import {
  getWalletActionError,
  sendWalletTransaction,
  sendWalletTransactionAndWait,
  waitForWalletTransactionReceipt
} from "./walletActions";

describe("walletActions", () => {
  it("returns the disconnected message before network errors", () => {
    expect(
      getWalletActionError({
        walletClient: null,
        publicClient: null,
        wrongNetwork: true,
        disconnectedMessage: "Connect wallet first.",
        wrongNetworkMessage: "Switch networks first."
      })
    ).toBe("Connect wallet first.");
  });

  it("returns the wrong-network message when wallet clients exist", () => {
    expect(
      getWalletActionError({
        walletClient: {
          account: { address: "0x0000000000000000000000000000000000000001" },
          sendTransaction: vi.fn()
        },
        publicClient: {
          waitForTransactionReceipt: vi.fn()
        },
        wrongNetwork: true,
        disconnectedMessage: "Connect wallet first.",
        wrongNetworkMessage: "Switch networks first."
      })
    ).toBe("Switch networks first.");
  });

  it("sends and waits for wallet transactions through the shared helpers", async () => {
    const sendTransactionMock = vi.fn().mockResolvedValue("0xabc");
    const waitForReceiptMock = vi.fn().mockResolvedValue(undefined);
    const walletClient = {
      account: { address: "0x0000000000000000000000000000000000000001" as const },
      sendTransaction: sendTransactionMock
    };
    const publicClient = {
      waitForTransactionReceipt: waitForReceiptMock
    };

    const hash = await sendWalletTransaction({
      walletClient,
      to: "0x0000000000000000000000000000000000000002",
      data: "0x1234"
    });
    expect(hash).toBe("0xabc");

    await waitForWalletTransactionReceipt(publicClient, "0xabc");
    expect(waitForReceiptMock).toHaveBeenCalledWith({ hash: "0xabc" });

    await sendWalletTransactionAndWait({
      walletClient,
      publicClient,
      to: "0x0000000000000000000000000000000000000003",
      data: "0x5678",
      value: 1n
    });
    expect(sendTransactionMock).toHaveBeenLastCalledWith({
      account: walletClient.account,
      to: "0x0000000000000000000000000000000000000003",
      data: "0x5678",
      value: 1n
    });
    expect(waitForReceiptMock).toHaveBeenLastCalledWith({ hash: "0xabc" });
  });
});
