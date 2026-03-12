import { createPublicClient, http, isAddress, type Address } from "viem";
import { NextRequest, NextResponse } from "next/server";
import { getAppChain } from "../../../../lib/chains";
import { getContractsConfig } from "../../../../lib/contracts";
import { verifyCollectionProxy } from "../../../../lib/etherscanVerification";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  const body = (await request.json().catch(() => null)) as
    | {
        chainId?: number;
        collectionAddress?: string;
        standard?: "ERC721" | "ERC1155";
      }
    | null;

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
