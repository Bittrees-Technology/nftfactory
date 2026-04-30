import { createPublicClient, http, isAddress, type Address } from "viem";
import { NextRequest, NextResponse } from "next/server";
import { getAppChain } from "../../../../lib/chains";
import { getContractsConfig } from "../../../../lib/contracts";
import { probeCollectionVerificationStatus, verifyCollectionProxy } from "../../../../lib/etherscanVerification";
import { parseJsonRequestBody } from "../../../../lib/requestBody";
import { validateRequestContentType } from "../../../../lib/requestContentType";
import { rateLimitRequest, resolveRequestRateLimitConfig } from "../../../../lib/requestRateLimit";
import { validateRequestContentLength } from "../../../../lib/requestSize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const MAX_COLLECTION_VERIFY_REQUEST_BYTES = 16 * 1024;
const COLLECTION_VERIFY_RATE_LIMIT = {
  bucket: "collection-verify",
  errorMessage: "Too many collection verification requests. Retry later.",
  ...resolveRequestRateLimitConfig(process.env, "COLLECTION_VERIFY", {
    maxRequests: 30,
    windowMs: 60_000
  })
} as const;

const factoryImplementationAbi = [
  {
    type: "function",
    name: "implementation721",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "implementation1155",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  }
] as const;

export async function POST(request: NextRequest): Promise<Response> {
  const rateLimitError = rateLimitRequest(request, COLLECTION_VERIFY_RATE_LIMIT);
  if (rateLimitError) {
    return NextResponse.json({ error: rateLimitError.error }, { status: rateLimitError.status, headers: rateLimitError.headers });
  }

  const contentTypeError = validateRequestContentType(request, "application/json", "Verification payload");
  if (contentTypeError) {
    return NextResponse.json({ error: contentTypeError.error }, { status: contentTypeError.status });
  }

  const contentLengthError = validateRequestContentLength(request, MAX_COLLECTION_VERIFY_REQUEST_BYTES, "Verification payload");
  if (contentLengthError) {
    return NextResponse.json({ error: contentLengthError.error }, { status: contentLengthError.status });
  }

  const bodyResult = await parseJsonRequestBody<{
    chainId?: number;
    collectionAddress?: string;
    standard?: "ERC721" | "ERC1155";
  } | null>(request, "Verification payload");
  if (!bodyResult.ok) {
    return NextResponse.json({ error: bodyResult.error }, { status: bodyResult.status });
  }

  const body = bodyResult.value;

  const chainId = Number(body?.chainId);
  const collectionAddress = body?.collectionAddress;
  const standard = body?.standard;

  if (!Number.isInteger(chainId) || chainId <= 0) {
    return NextResponse.json({ error: "Invalid chainId." }, { status: 400 });
  }
  if (!collectionAddress || !isAddress(collectionAddress)) {
    return NextResponse.json({ error: "Invalid collectionAddress." }, { status: 400 });
  }
  if (standard !== "ERC721" && standard !== "ERC1155") {
    return NextResponse.json({ error: "Invalid collection standard." }, { status: 400 });
  }

  try {
    const config = getContractsConfig(chainId);
    const publicClient = createPublicClient({
      chain: getAppChain(chainId),
      transport: http(config.rpcUrl)
    });

    const implementationAddress = (await publicClient.readContract({
      address: config.factory,
      abi: factoryImplementationAbi,
      functionName: standard === "ERC721" ? "implementation721" : "implementation1155"
    })) as Address;

    if (!isAddress(implementationAddress) || /^0x0{40}$/i.test(implementationAddress)) {
      return NextResponse.json(
        { error: `No ${standard} implementation is configured on the factory for chain ${chainId}.` },
        { status: 400 }
      );
    }

    const result = await verifyCollectionProxy({
      chainId,
      collectionAddress: collectionAddress as Address,
      expectedImplementation: implementationAddress
    });

    return NextResponse.json({
      ...result,
      implementationAddress
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Collection verification failed."
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  const search = request.nextUrl.searchParams;
  const chainId = Number(search.get("chainId"));
  const collectionAddress = search.get("collectionAddress");

  if (!Number.isInteger(chainId) || chainId <= 0) {
    return NextResponse.json({ error: "Invalid chainId." }, { status: 400 });
  }
  if (!collectionAddress || !isAddress(collectionAddress)) {
    return NextResponse.json({ error: "Invalid collectionAddress." }, { status: 400 });
  }

  try {
    const result = await probeCollectionVerificationStatus({
      chainId,
      collectionAddress: collectionAddress as Address
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Collection verification check failed."
      },
      { status: 500 }
    );
  }
}
