import { parseJsonResponse } from "./networkErrors";

export type VerifyCollectionContractParams = {
  chainId: number;
  collectionAddress: `0x${string}`;
  standard: "ERC721" | "ERC1155";
};

export type VerifyCollectionContractResponse = {
  state: "verified" | "pending" | "unsupported" | "error";
  message: string;
  explorerUrl: string | null;
  guid?: string | null;
  implementationAddress?: `0x${string}` | null;
};

export async function verifyCollectionContract(
  params: VerifyCollectionContractParams
): Promise<VerifyCollectionContractResponse> {
  const response = await fetch("/api/collections/verify", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(params)
  });
  return parseJsonResponse<VerifyCollectionContractResponse>(response);
}

