import { NextResponse } from "next/server";
import {resolveProfileEns} from "../../../../../../packages/profile/resolve-ens.mjs";
import {normalize} from "viem/ens";
import { mainnet } from "viem/chains";
import { getScopedChainPublicEnv } from "../../../../lib/publicEnv";

export const dynamic = "force-dynamic";

const MAINNET_RPC_URL =
  getScopedChainPublicEnv("NEXT_PUBLIC_RPC_URL", mainnet.id) ||
  process.env.NEXT_PUBLIC_RPC_URL_1 ||
  mainnet.rpcUrls.default.http[0] ||
  "";

const CACHE_TTL_MS = 60 * 1000;

type CacheEntry = {
  address: string | null;
  expiresAt: number;
};

const ensCache = new Map<string, CacheEntry>();

function isAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function normalizeEnsName(value: string | null): string | null {
  try {const name=normalize(String(value||"").trim());return name.endsWith(".eth")&&name.length<=255?name:null;}catch{return null;}
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
    const resolved = await resolveProfileEns(name,MAINNET_RPC_URL);
    const address = isAddress(String(resolved || "")) ? String(resolved) : null;
    if(ensCache.size>=1000)ensCache.delete(ensCache.keys().next().value!);
    if(address)ensCache.set(name, {
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
