import type { Chain } from "viem";
import { sepolia } from "viem/chains";
import { isAddress } from "./utils.js";

export function getRegistryBackfillChain(chainId: number): Chain {
  if (chainId !== sepolia.id) {
    throw new Error(
      `Historical registry backfill is currently configured for Sepolia only. Received chainId=${chainId}.`
    );
  }
  return sepolia;
}

export function getCollectionScanFromBlock(
  registeredAtBlock: bigint | null | undefined,
  fallbackFromBlock: bigint
): bigint {
  return registeredAtBlock && registeredAtBlock > 0n ? registeredAtBlock : fallbackFromBlock;
}

export function isStaleIsoTimestamp(
  value: string | null | undefined,
  ttlMs: number,
  now = Date.now()
): boolean {
  if (!value) return true;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return true;
  return now - parsed >= ttlMs;
}

export function getSharedBackfillTargets(env: {
  SHARED_721_ADDRESS?: string;
  NEXT_PUBLIC_SHARED_721_ADDRESS?: string;
  SHARED_1155_ADDRESS?: string;
  NEXT_PUBLIC_SHARED_1155_ADDRESS?: string;
}): Array<{
  contractAddress: `0x${string}`;
  standard: "ERC721" | "ERC1155";
  isNftFactoryCreated: boolean;
}> {
  const candidates = [
    {
      contractAddress: env.SHARED_721_ADDRESS || env.NEXT_PUBLIC_SHARED_721_ADDRESS,
      standard: "ERC721" as const
    },
    {
      contractAddress: env.SHARED_1155_ADDRESS || env.NEXT_PUBLIC_SHARED_1155_ADDRESS,
      standard: "ERC1155" as const
    }
  ];

  return candidates
    .map((item) => String(item.contractAddress || "").trim().toLowerCase())
    .filter((item): item is `0x${string}` => isAddress(item))
    .map((contractAddress, index) => ({
      contractAddress,
      standard: index === 0 ? "ERC721" : "ERC1155",
      isNftFactoryCreated: true
    }));
}
