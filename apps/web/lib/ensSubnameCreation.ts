import { encodeFunctionData, keccak256, stringToBytes } from "viem";
import type { Address, Hex } from "viem";

export const ENS_REGISTRY_ADDRESS = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e" as Address;
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const ENS_REGISTRY_WRITE_ABI = [
  {
    type: "function",
    name: "setSubnodeOwner",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "label", type: "bytes32" },
      { name: "owner", type: "address" }
    ],
    outputs: []
  }
] as const;

export const ENS_NAME_WRAPPER_WRITE_ABI = [
  {
    type: "function",
    name: "setSubnodeOwner",
    stateMutability: "nonpayable",
    inputs: [
      { name: "parentNode", type: "bytes32" },
      { name: "label", type: "string" },
      { name: "owner", type: "address" },
      { name: "fuses", type: "uint32" },
      { name: "expiry", type: "uint64" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "getData",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "owner", type: "address" },
      { name: "fuses", type: "uint32" },
      { name: "expiry", type: "uint64" }
    ]
  }
] as const;

export type EnsSubnameCreationContext = {
  fullName: string;
  label: string;
  parentName: string;
  parentNode: Hex;
  parentExpiry: bigint | null;
  currentOwner: string;
  parentOwner: string;
  parentWrapped: boolean;
  walletAddress: string;
  wrapperAddress: Address | null;
};

export function validateEnsSubnameCreation(context: EnsSubnameCreationContext): string | null {
  const currentOwner = context.currentOwner.toLowerCase();
  const parentOwner = context.parentOwner.toLowerCase();
  const walletAddress = context.walletAddress.toLowerCase();

  if (currentOwner !== ZERO_ADDRESS.toLowerCase()) {
    return `${context.fullName} is already registered in ENS.`;
  }
  if (parentOwner === ZERO_ADDRESS.toLowerCase()) {
    return `${context.parentName} is not registered yet.`;
  }
  if (parentOwner !== walletAddress) {
    return `The connected wallet does not control ${context.parentName}.`;
  }
  if (context.parentWrapped && !context.wrapperAddress) {
    return `${context.parentName} is wrapped via ENS NameWrapper, but no wrapper contract is configured here.`;
  }
  if (context.parentWrapped && (!context.parentExpiry || context.parentExpiry <= 0n)) {
    return `${context.parentName} is wrapped, but its wrapper expiry could not be read.`;
  }

  return null;
}

export function buildEnsSubnameCreationTx(context: EnsSubnameCreationContext): { to: Address; data: Hex } {
  const validationError = validateEnsSubnameCreation(context);
  if (validationError) {
    throw new Error(validationError);
  }

  if (context.parentWrapped) {
    return {
      to: context.wrapperAddress!,
      data: encodeFunctionData({
        abi: ENS_NAME_WRAPPER_WRITE_ABI,
        functionName: "setSubnodeOwner",
        args: [context.parentNode, context.label, context.walletAddress as Address, 0, context.parentExpiry!]
      })
    };
  }

  return {
    to: ENS_REGISTRY_ADDRESS,
    data: encodeFunctionData({
      abi: ENS_REGISTRY_WRITE_ABI,
      functionName: "setSubnodeOwner",
      args: [context.parentNode, keccak256(stringToBytes(context.label)), context.walletAddress as Address]
    })
  };
}
