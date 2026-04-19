import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { fetchCollectionsByOwner } from "../../../../lib/indexerApi";

type WalletIdentityResponse = {
  ownerAddress: string;
  ensNames: string[];
  collections: Awaited<ReturnType<typeof fetchCollectionsByOwner>>["collections"];
  cached: boolean;
};

type CacheEntry = {
  cachedAt: number;
  value: WalletIdentityResponse;
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const walletIdentityCache = new Map<string, CacheEntry>();

function normalizeEnsName(value: string | null | undefined): string | null {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\.+/g, ".")
    .replace(/^\./, "")
    .replace(/\.$/, "");
  return normalized || null;
}

export async function GET(request: NextRequest) {
  const ownerAddress = String(request.nextUrl.searchParams.get("ownerAddress") || "").trim().toLowerCase();
  const chainId = Number.parseInt(String(request.nextUrl.searchParams.get("chainId") || "0"), 10);

  if (!isAddress(ownerAddress)) {
    return NextResponse.json({ error: "Valid ownerAddress is required." }, { status: 400 });
  }
  if (!Number.isInteger(chainId) || chainId <= 0) {
    return NextResponse.json({ error: "Valid chainId is required." }, { status: 400 });
  }

  const cacheKey = `${chainId}:${ownerAddress}`;
  const cached = walletIdentityCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return NextResponse.json({
      ...cached.value,
      cached: true
    });
  }

  const ownedCollections = await fetchCollectionsByOwner(ownerAddress, { chainId });
  const ensNames = [...new Set(
    (ownedCollections.collections || [])
      .map((collection) => normalizeEnsName(collection.ensSubname))
      .filter((value): value is string => typeof value === "string" && value.endsWith(".eth"))
  )].sort((left, right) => left.localeCompare(right));

  const response: WalletIdentityResponse = {
    ownerAddress,
    ensNames,
    collections: ownedCollections.collections || [],
    cached: false
  };

  walletIdentityCache.set(cacheKey, {
    cachedAt: Date.now(),
    value: response
  });

  return NextResponse.json(response);
}
