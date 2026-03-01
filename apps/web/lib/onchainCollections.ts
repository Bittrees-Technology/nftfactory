import type { Address, PublicClient } from "viem";

type CollectionCandidate = {
  contractAddress: string;
  ensSubname: string | null;
  ownerAddress: string;
};

export type VerifiedCollection = CollectionCandidate & {
  chainOwnerAddress: string;
};

const ownedContractAbi = [
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  }
] as const;

function isAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export async function verifyOwnedCollectionsOnChain(
  publicClient: PublicClient | undefined,
  ownerAddress: string,
  candidates: CollectionCandidate[]
): Promise<VerifiedCollection[]> {
  if (!publicClient || !isAddress(ownerAddress) || candidates.length === 0) {
    return [];
  }

  const normalizedOwner = ownerAddress.toLowerCase();
  const deduped = new Map<string, CollectionCandidate>();
  for (const item of candidates) {
    if (!isAddress(item.contractAddress)) continue;
    const key = item.contractAddress.toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, item);
    }
  }

  const verified = await Promise.all(
    [...deduped.values()].map(async (item) => {
      try {
        const chainOwner = await publicClient.readContract({
          address: item.contractAddress as Address,
          abi: ownedContractAbi,
          functionName: "owner"
        });
        if (String(chainOwner).toLowerCase() !== normalizedOwner) {
          return null;
        }
        return {
          ...item,
          chainOwnerAddress: String(chainOwner)
        } satisfies VerifiedCollection;
      } catch {
        return null;
      }
    })
  );

  return verified.filter((item): item is VerifiedCollection => !!item);
}
