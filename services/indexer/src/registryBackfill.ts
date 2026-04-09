import type { Chain } from "viem";
import { sepolia } from "viem/chains";

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
