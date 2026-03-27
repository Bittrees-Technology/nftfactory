import { NextResponse } from "next/server";
import {
  buildIpfsAuthHeaders,
  buildIpfsVersionUrl,
  getIpfsApiAuthMode,
  isPrivateOrLocalUrl
} from "../../../../lib/ipfsUpload";
import { getLegacyChainPublicEnv, getRootPublicEnv, getScopedChainPublicEnv } from "../../../../lib/publicEnv";

export const dynamic = "force-dynamic";

type ServiceCheck = {
  label: string;
  url: string | null;
  ok: boolean;
  status: number | null;
  message: string;
};

const REQUEST_TIMEOUT_MS = 8_000;

function parseEnabledChainIds(): number[] {
  const raw = (getRootPublicEnv("NEXT_PUBLIC_ENABLED_CHAIN_IDS") || "").trim();
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter(Number.isFinite);
}

function getActiveChainIds(): number[] {
  const primaryChainId = Number.parseInt(
    getRootPublicEnv("NEXT_PUBLIC_PRIMARY_CHAIN_ID") || getRootPublicEnv("NEXT_PUBLIC_CHAIN_ID") || "1",
    10
  );
  return Array.from(new Set([primaryChainId, ...parseEnabledChainIds()])).filter(Number.isFinite);
}

function maskUrl(urlLike: string | null | undefined): string | null {
  if (!urlLike) {
    return null;
  }

  try {
    const url = new URL(urlLike);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return urlLike;
  }
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store"
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function checkIndexer(chainId: number): Promise<ServiceCheck> {
  const configuredUrl =
    getScopedChainPublicEnv("NEXT_PUBLIC_INDEXER_API_URL", chainId) ||
    (String(chainId) === (getRootPublicEnv("NEXT_PUBLIC_PRIMARY_CHAIN_ID") || getRootPublicEnv("NEXT_PUBLIC_CHAIN_ID") || "1")
      ? getLegacyChainPublicEnv("NEXT_PUBLIC_INDEXER_API_URL")
      : undefined);

  if (!configuredUrl) {
    return {
      label: `indexer:${chainId}`,
      url: null,
      ok: false,
      status: null,
      message: "Missing NEXT_PUBLIC_INDEXER_API_URL for this chain."
    };
  }

  if (isPrivateOrLocalUrl(configuredUrl)) {
    return {
      label: `indexer:${chainId}`,
      url: maskUrl(configuredUrl),
      ok: false,
      status: null,
      message: "Configured indexer URL is private/local and not reachable from a public deployment."
    };
  }

  try {
    const response = await fetchWithTimeout(`${configuredUrl.replace(/\/$/, "")}/health`);
    const text = await response.text();
    return {
      label: `indexer:${chainId}`,
      url: maskUrl(configuredUrl),
      ok: response.ok,
      status: response.status,
      message: response.ok ? "OK" : text || `HTTP ${response.status}`
    };
  } catch (error) {
    return {
      label: `indexer:${chainId}`,
      url: maskUrl(configuredUrl),
      ok: false,
      status: null,
      message: error instanceof Error ? error.message : "Indexer request failed."
    };
  }
}

async function checkIpfs(): Promise<ServiceCheck> {
  const configuredUrl = String(process.env.IPFS_API_URL || "").trim();
  if (!configuredUrl) {
    return {
      label: "ipfs",
      url: null,
      ok: false,
      status: null,
      message: "Missing IPFS_API_URL."
    };
  }

  const authMode = getIpfsApiAuthMode(process.env);

  if (isPrivateOrLocalUrl(configuredUrl)) {
    return {
      label: "ipfs",
      url: maskUrl(configuredUrl),
      ok: false,
      status: null,
      message: `Configured IPFS API URL is private/local and not reachable from a public deployment. (auth: ${authMode})`
    };
  }

  const versionUrl = buildIpfsVersionUrl(configuredUrl);

  try {
    const response = await fetchWithTimeout(versionUrl, {
      method: "POST",
      headers: buildIpfsAuthHeaders(process.env)
    });
    const text = await response.text();
    return {
      label: "ipfs",
      url: maskUrl(versionUrl),
      ok: response.ok,
      status: response.status,
      message: response.ok ? `OK (auth: ${authMode})` : text || `HTTP ${response.status} (auth: ${authMode})`
    };
  } catch (error) {
    return {
      label: "ipfs",
      url: maskUrl(versionUrl),
      ok: false,
      status: null,
      message: error instanceof Error ? `${error.message} (auth: ${authMode})` : `IPFS request failed. (auth: ${authMode})`
    };
  }
}

export async function GET() {
  const chainIds = getActiveChainIds();
  const [ipfs, ...indexers] = await Promise.all([
    checkIpfs(),
    ...chainIds.map((chainId) => checkIndexer(chainId))
  ]);

  const checks = [ipfs, ...indexers];
  const ok = checks.every((check) => check.ok);

  return NextResponse.json(
    {
      ok,
      checks
    },
    { status: ok ? 200 : 503 }
  );
}
