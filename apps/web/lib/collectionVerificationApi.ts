import { parseJsonResponse, sanitizeBackendErrorMessage } from "./networkErrors";

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
  const text = await response.text();
  if (!response.ok) {
    const parsedError = (() => {
      try {
        const json = JSON.parse(text) as { error?: string };
        return typeof json.error === "string" ? json.error : "";
      } catch {
        return "";
      }
    })();
    throw new Error(
      sanitizeBackendErrorMessage(
        parsedError || text,
        "Collection verification request failed.",
        { serviceLabel: "Collection verification backend" }
      )
    );
  }
  return parseJsonResponse<VerifyCollectionContractResponse>(
    text,
    "Collection verification response was not valid JSON."
  );
}
