import { NextResponse } from "next/server";
import {
  buildIpfsAuthHeaders,
  buildIpfsVersionUrl,
  getIpfsApiAuthMode,
  isPrivateOrLocalUrl,
  resolveIpfsApiUrl,
  resolveIpfsApiUrls
} from "../../../../lib/ipfsUpload";
import { resolveIndexerServerUrl } from "../../../../lib/indexerServerEnv";
import { getLegacyChainPublicEnv, getRootPublicEnv, getScopedChainPublicEnv } from "../../../../lib/publicEnv";

export const dynamic = "force-dynamic";

type ServiceCheck = {
  label: string;
  url: string | null;
  ok: boolean;
  status: number | null;
  message: string;
  details?: Record<string, unknown>;
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
    resolveIndexerServerUrl(chainId) ||
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
      message: "Missing INDEXER_API_URL or NEXT_PUBLIC_INDEXER_API_URL for this chain."
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
    let details: Record<string, unknown> | undefined;
    try {
      const parsed = JSON.parse(text) as {
        indexingSources?: {
          sharedContracts?: { count?: number };
          explicitCustomCollections?: { count?: number; configured?: boolean };
        };
      };
      if (parsed && typeof parsed === "object") {
        details = parsed as Record<string, unknown>;
      }
    } catch {
      details = undefined;
    }

    const sharedCount = Number(
      ((details?.indexingSources as Record<string, unknown> | undefined)?.sharedContracts as Record<string, unknown> | undefined)?.count || 0
    );
    const explicitCustom = ((details?.indexingSources as Record<string, unknown> | undefined)?.explicitCustomCollections as Record<string, unknown> | undefined) || undefined;
    const customCount = Number(explicitCustom?.count || 0);
    const customConfigured = Boolean(explicitCustom?.configured);
    const sourceSummary =
      sharedCount > 0 || customConfigured
        ? `shared=${sharedCount}, custom=${customCount}${customConfigured ? "" : " (custom file unset)"}`
        : "registry-only";

    return {
      label: `indexer:${chainId}`,
      url: maskUrl(configuredUrl),
      ok: response.ok,
      status: response.status,
      message: response.ok ? `OK (${sourceSummary})` : text || `HTTP ${response.status}`,
      details
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
  const configuredUrls = resolveIpfsApiUrls(process.env);
  const configuredUrl = configuredUrls[0] || resolveIpfsApiUrl(process.env);
  if (!configuredUrl) {
    return {
      label: "ipfs",
      url: null,
      ok: false,
      status: null,
      message: "Missing IPFS_API_URL or IPFS_API_BASE_URL."
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

  const versionUrls = (configuredUrls.length > 0 ? configuredUrls : [configuredUrl]).map((url) => buildIpfsVersionUrl(url));
  let lastFailure: ServiceCheck | null = null;

  for (const versionUrl of versionUrls) {
    try {
      const response = await fetchWithTimeout(versionUrl, {
        method: "POST",
        headers: buildIpfsAuthHeaders(process.env)
      });
      const text = await response.text();
      if (response.ok) {
        return {
          label: "ipfs",
          url: maskUrl(versionUrl),
          ok: true,
          status: response.status,
          message: `OK (auth: ${authMode})`,
          details: versionUrls.length > 1 ? { checkedUrls: versionUrls.map((url) => maskUrl(url)) } : undefined
        };
      }
      lastFailure = {
        label: "ipfs",
        url: maskUrl(versionUrl),
        ok: false,
        status: response.status,
        message: text || `HTTP ${response.status} (auth: ${authMode})`
      };
    } catch (error) {
      lastFailure = {
        label: "ipfs",
        url: maskUrl(versionUrl),
        ok: false,
        status: null,
        message: error instanceof Error ? `${error.message} (auth: ${authMode})` : `IPFS request failed. (auth: ${authMode})`
      };
    }
  }

  return lastFailure || {
    label: "ipfs",
    url: maskUrl(versionUrls[0] || configuredUrl),
    ok: false,
    status: null,
    message: `IPFS request failed. (auth: ${authMode})`
  };
}

function checkWalletConnect(): ServiceCheck {
  const projectId = String(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "").trim();

  if (!projectId) {
    return {
      label: "walletconnect",
      url: null,
      ok: false,
      status: null,
      message:
        "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is missing. Browser extension wallets can still connect, but QR/mobile WalletConnect sessions may fail."
    };
  }

  return {
    label: "walletconnect",
    url: null,
    ok: true,
    status: 200,
    message: "Configured"
  };
}

export async function GET() {
  const chainIds = getActiveChainIds();
  const walletConnect = checkWalletConnect();
  const [ipfs, ...indexers] = await Promise.all([
    checkIpfs(),
    ...chainIds.map((chainId) => checkIndexer(chainId))
  ]);

  const checks = [walletConnect, ipfs, ...indexers];
  const ok = checks.every((check) => check.ok);

  return NextResponse.json(
    {
      ok,
      checks
    },
    { status: ok ? 200 : 503 }
  );
}
