import type { ApiOwnedCollections } from "./indexerApi";

export type ApiWalletIdentity = {
  ownerAddress: string;
  ensNames: string[];
  collections: ApiOwnedCollections["collections"];
  cached: boolean;
};

export async function fetchWalletIdentity(args: {
  ownerAddress: string;
  chainId: number;
}): Promise<ApiWalletIdentity> {
  const params = new URLSearchParams({
    ownerAddress: args.ownerAddress,
    chainId: String(args.chainId)
  });
  const response = await fetch(`/api/wallet/identity?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json"
    }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Wallet identity request failed (${response.status})`);
  }
  return (await response.json()) as ApiWalletIdentity;
}
