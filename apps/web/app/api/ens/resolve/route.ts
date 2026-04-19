import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { getScopedChainPublicEnv } from "../../../../lib/publicEnv";

export const dynamic = "force-dynamic";

const MAINNET_RPC_URL =
  getScopedChainPublicEnv("NEXT_PUBLIC_RPC_URL", mainnet.id) ||
  process.env.NEXT_PUBLIC_RPC_URL_1 ||
  mainnet.rpcUrls.default.http[0] ||
  "";

const CACHE_TTL_MS = 10 * 60 * 1000;

type CacheEntry = {
  address: string | null;
  expiresAt: number;
};

const ensCache = new Map<string, CacheEntry>();

function isAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function normalizeEnsName(value: string | null): string | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || !normalized.endsWith(".eth")) return null;
  if (!/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(normalized)) return null;
  return normalized;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const name = normalizeEnsName(url.searchParams.get("name"));

  if (!name) {
    return NextResponse.json({ error: "Valid ENS name is required." }, { status: 400 });
  }

  if (!MAINNET_RPC_URL) {
    return NextResponse.json({ error: "Mainnet ENS resolution is not configured for this deployment." }, { status: 503 });
  }

  const cached = ensCache.get(name);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(
      { name, address: cached.address, cached: true },
      { headers: { "Cache-Control": "private, max-age=60" } }
    );
  }

  try {
    const client = createPublicClient({
      chain: mainnet,
      transport: http(MAINNET_RPC_URL)
    });
    const resolved = await client.getEnsAddress({ name });
    const address = isAddress(String(resolved || "")) ? String(resolved) : null;
    ensCache.set(name, {
      address,
      expiresAt: Date.now() + CACHE_TTL_MS
    });
    return NextResponse.json(
      { name, address, cached: false },
      { headers: { "Cache-Control": "private, max-age=60" } }
    );
  } catch {
    return NextResponse.json({ error: "ENS resolution is unavailable right now." }, { status: 502 });
  }
}
