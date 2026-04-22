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

export type ProbeCollectionVerificationResponse = {
  state: "verified" | "pending" | "unsupported" | "error";
  message: string;
  explorerUrl: string | null;
  guid?: string | null;
};

function extractErrorText(text: string, fallbackMessage: string): string {
  const parsedError = (() => {
    try {
      const json = JSON.parse(text) as { error?: string };
      return typeof json.error === "string" ? json.error : "";
    } catch {
      return "";
    }
  })();

  return sanitizeBackendErrorMessage(
    parsedError || text,
    fallbackMessage,
    { serviceLabel: "Collection verification backend" }
  );
}

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
    throw new Error(extractErrorText(text, "Collection verification request failed."));
  }
  return parseJsonResponse<VerifyCollectionContractResponse>(
    text,
    "Collection verification response was not valid JSON."
  );
}

export async function probeCollectionVerification(
  chainId: number,
  collectionAddress: `0x${string}`
): Promise<ProbeCollectionVerificationResponse> {
  const response = await fetch(
    `/api/collections/verify?chainId=${encodeURIComponent(String(chainId))}&collectionAddress=${encodeURIComponent(collectionAddress)}`
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(extractErrorText(text, "Collection verification status check failed."));
  }
  return parseJsonResponse<ProbeCollectionVerificationResponse>(
    text,
    "Collection verification status response was not valid JSON."
  );
}
