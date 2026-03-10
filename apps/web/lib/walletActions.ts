import type { Hex } from "viem";

export type WalletTransactionClient = {
  account?: { address: `0x${string}` } | null;
  sendTransaction(args: {
    account: { address: `0x${string}` };
    to: `0x${string}`;
    data: `0x${string}`;
    value?: bigint;
  }): Promise<Hex>;
};

export type WalletReceiptClient = {
  waitForTransactionReceipt(args: { hash: Hex }): Promise<unknown>;
};

export function getWalletActionError({
  walletClient,
  publicClient,
  wrongNetwork,
  disconnectedMessage,
  wrongNetworkMessage
}: {
  walletClient?: WalletTransactionClient | null;
  publicClient?: WalletReceiptClient | null;
  wrongNetwork: boolean;
  disconnectedMessage: string;
  wrongNetworkMessage: string;
}): string | null {
  if (!walletClient?.account || !publicClient) {
    return disconnectedMessage;
  }
  if (wrongNetwork) {
    return wrongNetworkMessage;
  }
  return null;
}

export async function sendWalletTransaction({
  walletClient,
  to,
  data,
  value
}: {
  walletClient: WalletTransactionClient;
  to: `0x${string}`;
  data: `0x${string}`;
  value?: bigint;
}): Promise<Hex> {
  if (!walletClient.account) {
    throw new Error("Connect wallet first.");
  }
  return await walletClient.sendTransaction({
    account: walletClient.account,
    to,
    data,
    value
  });
}

export async function waitForWalletTransactionReceipt(
  publicClient: WalletReceiptClient | null | undefined,
  hash: Hex
): Promise<void> {
  if (!publicClient) {
    throw new Error("Public client unavailable. Reconnect wallet and try again.");
  }
  await publicClient.waitForTransactionReceipt({ hash });
}

export async function sendWalletTransactionAndWait({
  walletClient,
  publicClient,
  to,
  data,
  value
}: {
  walletClient: WalletTransactionClient;
  publicClient: WalletReceiptClient;
  to: `0x${string}`;
  data: `0x${string}`;
  value?: bigint;
}): Promise<Hex> {
  const hash = await sendWalletTransaction({ walletClient, to, data, value });
  await waitForWalletTransactionReceipt(publicClient, hash);
  return hash;
}
