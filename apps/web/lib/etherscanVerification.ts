import { getExplorerBaseUrl } from "./chains";

export type CollectionVerificationState = "verified" | "pending" | "unsupported" | "error";

export type CollectionVerificationResult = {
  state: CollectionVerificationState;
  message: string;
  explorerUrl: string | null;
  guid?: string | null;
};

type EtherscanEnvelope = {
  status?: string;
  message?: string;
  result?: string;
};

const ETHERSCAN_API_BASE = "https://api.etherscan.io/v2/api";
const VERIFICATION_POLL_DELAY_MS = process.env.NODE_ENV === "test" ? 1 : 2500;

function getEtherscanApiKey(): string {
  return String(process.env.ETHERSCAN_API_KEY || "").trim();
}

function buildExplorerCodeUrl(chainId: number, collectionAddress: `0x${string}`): string | null {
  const baseUrl = getExplorerBaseUrl(chainId);
  return baseUrl ? `${baseUrl}/address/${collectionAddress}#code` : null;
}

async function parseEtherscanEnvelope(response: Response): Promise<EtherscanEnvelope> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as EtherscanEnvelope;
  } catch {
    return {
      status: response.ok ? "1" : "0",
      message: response.ok ? "OK" : "NOTOK",
      result: text.trim()
    };
  }
}

async function callEtherscan(
  chainId: number,
  params: Record<string, string>,
  method: "GET" | "POST" = "GET"
): Promise<EtherscanEnvelope> {
  const apiKey = getEtherscanApiKey();
  if (!apiKey) {
    return {
      status: "0",
      message: "NOTOK",
      result: "ETHERSCAN_API_KEY is not configured for this deployment."
    };
  }

  const search = new URLSearchParams({
    chainid: String(chainId),
    apikey: apiKey,
    module: "contract",
    ...params
  });

  const response =
    method === "POST"
      ? await fetch(ETHERSCAN_API_BASE, {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded"
          },
          body: search.toString(),
          cache: "no-store"
        })
      : await fetch(`${ETHERSCAN_API_BASE}?${search.toString()}`, {
          cache: "no-store"
        });

  return parseEtherscanEnvelope(response);
}

function classifyVerificationResponse(result: string | undefined): CollectionVerificationState {
  const normalized = String(result || "").toLowerCase();
  if (
    normalized.includes("already verified") ||
    normalized.includes("pass - verified") ||
    normalized.includes("already verified as a proxy") ||
    normalized.includes("source code already verified")
  ) {
    return "verified";
  }
  if (
    normalized.includes("pending in queue") ||
    normalized.includes("submitted for verification") ||
    normalized.includes("already pending") ||
    normalized.includes("proxy verification in progress") ||
    normalized.includes("unable to locate contractcode")
  ) {
    return "pending";
  }
  if (
    normalized.includes("not supported") ||
    normalized.includes("unsupported chain") ||
    normalized.includes("invalid chainid")
  ) {
    return "unsupported";
  }
  return "error";
}

async function checkAlreadyVerified(
  chainId: number,
  collectionAddress: `0x${string}`
): Promise<CollectionVerificationResult | null> {
  const envelope = await callEtherscan(chainId, {
    action: "getabi",
    address: collectionAddress
  });

  if (envelope.status === "1" && envelope.result) {
    return {
      state: "verified",
      message: "This collection contract is already verified on the explorer.",
      explorerUrl: buildExplorerCodeUrl(chainId, collectionAddress)
    };
  }

  const normalized = String(envelope.result || "").toLowerCase();
  if (normalized.includes("contract source code not verified")) {
    return null;
  }

  if (!envelope.result) {
    return null;
  }

  return {
    state: classifyVerificationResponse(envelope.result),
    message: String(envelope.result),
    explorerUrl: buildExplorerCodeUrl(chainId, collectionAddress)
  };
}

async function submitProxyVerification(
  chainId: number,
  collectionAddress: `0x${string}`,
  expectedImplementation: `0x${string}`
): Promise<EtherscanEnvelope> {
  return callEtherscan(
    chainId,
    {
      action: "verifyproxycontract",
      address: collectionAddress,
      expectedimplementation: expectedImplementation
    },
    "POST"
  );
}

async function checkProxyVerification(chainId: number, guid: string): Promise<EtherscanEnvelope> {
  return callEtherscan(chainId, {
    action: "checkproxyverification",
    guid
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function verifyCollectionProxy(params: {
  chainId: number;
  collectionAddress: `0x${string}`;
  expectedImplementation: `0x${string}`;
}): Promise<CollectionVerificationResult> {
  const { chainId, collectionAddress, expectedImplementation } = params;

  if (!getEtherscanApiKey()) {
    return {
      state: "unsupported",
      message: "ETHERSCAN_API_KEY is not configured for this deployment.",
      explorerUrl: buildExplorerCodeUrl(chainId, collectionAddress)
    };
  }

  const existing = await checkAlreadyVerified(chainId, collectionAddress);
  if (existing?.state === "verified") {
    return existing;
  }

  const submission = await submitProxyVerification(chainId, collectionAddress, expectedImplementation);
  const explorerUrl = buildExplorerCodeUrl(chainId, collectionAddress);
  const submissionResult = String(submission.result || "");
  const guid = /^[A-Za-z0-9-]+$/.test(submissionResult) ? submissionResult : null;

  if (submission.status === "1" && guid) {
    // Continue into polling below.
  } else {
    const initialState = classifyVerificationResponse(submission.result);
    if (initialState === "verified") {
      return {
        state: "verified",
        message: String(submission.result || "Collection contract verified on the explorer."),
        explorerUrl
      };
    }

    if (initialState === "unsupported" || initialState === "error") {
      return {
        state: initialState,
        message: String(submission.result || "Collection verification failed."),
        explorerUrl
      };
    }
  }

  if (!guid) {
    return {
      state: "pending",
      message: String(submission.result || "Verification request submitted to the explorer."),
      explorerUrl
    };
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    await wait(VERIFICATION_POLL_DELAY_MS);
    const status = await checkProxyVerification(chainId, guid);
    const state = classifyVerificationResponse(status.result);
    if (state === "verified") {
      return {
        state: "verified",
        message: "Collection contract verified on the explorer.",
        explorerUrl,
        guid
      };
    }
    if (state === "unsupported" || state === "error") {
      return {
        state,
        message: String(status.result || "Explorer verification failed."),
        explorerUrl,
        guid
      };
    }
  }

  return {
    state: "pending",
    message: "Verification request submitted to the explorer. It is still processing.",
    explorerUrl,
    guid
  };
}
