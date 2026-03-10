import type { Address, Hex } from "viem";
import { encodeErc20Approve, encodeSetApprovalForAll } from "./abi";
import { buildBuyPlan } from "./marketplaceBuy";
import {
  sendWalletTransactionAndWait,
  type WalletReceiptClient,
  type WalletTransactionClient
} from "./walletActions";

const ERC20_ALLOWANCE_ABI = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    outputs: [{ name: "", type: "uint256" }]
  }
] as const;

const APPROVAL_FOR_ALL_ABI = [
  {
    type: "function",
    name: "isApprovedForAll",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "operator", type: "address" }
    ],
    outputs: [{ name: "", type: "bool" }]
  }
] as const;

type ApprovalPublicClient = WalletReceiptClient & {
  readContract(args: unknown): Promise<unknown>;
};

export async function ensureErc20SpendApproval({
  walletClient,
  publicClient,
  tokenAddress,
  spender,
  requiredAmount,
  zeroAddress
}: {
  walletClient: WalletTransactionClient;
  publicClient: ApprovalPublicClient;
  tokenAddress: `0x${string}`;
  spender: `0x${string}`;
  requiredAmount: bigint;
  zeroAddress: `0x${string}`;
}): Promise<Hex[]> {
  if (tokenAddress.toLowerCase() === zeroAddress.toLowerCase()) {
    return [];
  }

  const ownerAddress = walletClient.account?.address;
  if (!ownerAddress) {
    throw new Error("Connect wallet first.");
  }

  const allowance = (await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ALLOWANCE_ABI,
    functionName: "allowance",
    args: [ownerAddress, spender]
  })) as bigint;

  const plan = buildBuyPlan({
    paymentToken: tokenAddress,
    zeroAddress,
    price: requiredAmount,
    allowance
  });

  const approvalHashes: Hex[] = [];
  for (const approvalAmount of plan.approvalAmounts) {
    const hash = await sendWalletTransactionAndWait({
      walletClient,
      publicClient,
      to: tokenAddress,
      data: encodeErc20Approve(spender, approvalAmount) as Hex
    });
    approvalHashes.push(hash);
  }
  return approvalHashes;
}

export async function ensureCollectionApprovalForAll({
  walletClient,
  publicClient,
  nftAddress,
  ownerAddress,
  operator
}: {
  walletClient: WalletTransactionClient;
  publicClient: ApprovalPublicClient;
  nftAddress: `0x${string}`;
  ownerAddress: `0x${string}`;
  operator: `0x${string}`;
}): Promise<Hex | null> {
  const isApproved = (await publicClient.readContract({
    address: nftAddress as Address,
    abi: APPROVAL_FOR_ALL_ABI,
    functionName: "isApprovedForAll",
    args: [ownerAddress, operator]
  })) as boolean;

  if (isApproved) {
    return null;
  }

  return await sendWalletTransactionAndWait({
    walletClient,
    publicClient,
    to: nftAddress,
    data: encodeSetApprovalForAll(operator, true) as Hex
  });
}
