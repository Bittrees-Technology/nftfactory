import type { NextConfig } from "next";
import path from "node:path";
import { resolveBasicAuthConfig } from "./lib/basicAuth";
import {
  buildIpfsAuthRequirementError,
  buildIpfsReachabilityError,
  isPrivateOrLocalUrl,
  isPublicIpfsApiMissingRequiredAuth,
  resolveIpfsApiUrl
} from "./lib/ipfsUpload";

const primaryChainId = process.env.NEXT_PUBLIC_PRIMARY_CHAIN_ID || process.env.NEXT_PUBLIC_CHAIN_ID || "1";

const REQUIRED_PUBLIC_ENV = [
  "NEXT_PUBLIC_REGISTRY_ADDRESS",
  "NEXT_PUBLIC_MARKETPLACE_ADDRESS",
  "NEXT_PUBLIC_SHARED_721_ADDRESS",
  "NEXT_PUBLIC_SHARED_1155_ADDRESS",
  "NEXT_PUBLIC_SUBNAME_REGISTRAR_ADDRESS",
  "NEXT_PUBLIC_FACTORY_ADDRESS"
];

function parseEnabledChainIds(): number[] {
  const raw = (process.env.NEXT_PUBLIC_ENABLED_CHAIN_IDS || "").trim();
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter(Number.isFinite);
}

function splitCsvEnv(value: string | undefined): string[] {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolveChainPublicRpcUrls(chainId: number): string[] {
  const scopedUrls = [
    ...splitCsvEnv(process.env[`NEXT_PUBLIC_RPC_URLS_${chainId}`]),
    String(process.env[`NEXT_PUBLIC_RPC_URL_${chainId}`] || "").trim()
  ];

  if (String(chainId) === primaryChainId) {
    scopedUrls.push(...splitCsvEnv(process.env.NEXT_PUBLIC_RPC_URLS));
    scopedUrls.push(String(process.env.NEXT_PUBLIC_RPC_URL || "").trim());
  }

  return scopedUrls.filter(Boolean).filter((value, index, list) => list.indexOf(value) === index);
}

function getActiveProductionChainIds(primaryChainIdValue: string): number[] {
  return Array.from(new Set([Number.parseInt(primaryChainIdValue, 10), ...parseEnabledChainIds()])).filter(Number.isFinite);
}

if (process.env.NODE_ENV === "production") {
  const missing = REQUIRED_PUBLIC_ENV.filter(
    (name) => !process.env[`${name}_${primaryChainId}`] && !process.env[name]
  ).map((name) => `${name}_${primaryChainId}`);
  if (resolveChainPublicRpcUrls(Number.parseInt(primaryChainId, 10)).length === 0) {
    missing.unshift(`NEXT_PUBLIC_RPC_URL_${primaryChainId} (or NEXT_PUBLIC_RPC_URLS_${primaryChainId})`);
  }
  if (missing.length > 0) {
    throw new Error(`Missing required env vars for production build:\n  ${missing.join("\n  ")}`);
  }

  const basicAuth = resolveBasicAuthConfig(process.env);
  if (basicAuth.misconfigured) {
    throw new Error("SITE_BASIC_AUTH_ENABLED requires SITE_BASIC_AUTH_PASSWORD to be set.");
  }

  const resolvedIpfsApiUrl = resolveIpfsApiUrl(process.env);

  if (process.env.VERCEL && resolvedIpfsApiUrl && isPrivateOrLocalUrl(resolvedIpfsApiUrl)) {
    throw new Error(buildIpfsReachabilityError(resolvedIpfsApiUrl));
  }

  if (process.env.VERCEL) {
    const chainIds = getActiveProductionChainIds(primaryChainId);
    const invalidPublicEnv: string[] = [];
    const missingPublicEnv: string[] = [];

    const ipfsApiUrl = resolvedIpfsApiUrl;

    if (!ipfsApiUrl) {
      throw new Error("Missing required env var for production build: IPFS_API_URL or IPFS_API_BASE_URL");
    }

    if (isPublicIpfsApiMissingRequiredAuth(ipfsApiUrl, process.env)) {
      throw new Error(buildIpfsAuthRequirementError(ipfsApiUrl));
    }

    for (const chainId of chainIds) {
      const publicRpcUrls = resolveChainPublicRpcUrls(chainId);
      const scopedName = `NEXT_PUBLIC_INDEXER_API_URL_${chainId}`;
      const scopedValue = process.env[scopedName];
      const canUseLegacy = String(chainId) === primaryChainId;
      const fallbackValue = canUseLegacy ? process.env.NEXT_PUBLIC_INDEXER_API_URL : undefined;

      if (publicRpcUrls.length === 0) {
        missingPublicEnv.push(
          canUseLegacy
            ? `NEXT_PUBLIC_RPC_URL_${chainId} (or NEXT_PUBLIC_RPC_URLS_${chainId} / NEXT_PUBLIC_RPC_URL / NEXT_PUBLIC_RPC_URLS)`
            : `NEXT_PUBLIC_RPC_URL_${chainId} (or NEXT_PUBLIC_RPC_URLS_${chainId})`
        );
      }

      for (const rpcUrl of publicRpcUrls) {
        if (isPrivateOrLocalUrl(rpcUrl)) {
          invalidPublicEnv.push(`NEXT_PUBLIC_RPC_URL_${chainId}=${rpcUrl}`);
        }
      }

      if (!String(scopedValue || "").trim() && !String(fallbackValue || "").trim()) {
        missingPublicEnv.push(canUseLegacy ? `${scopedName} (or NEXT_PUBLIC_INDEXER_API_URL)` : scopedName);
        continue;
      }

      if (scopedValue && isPrivateOrLocalUrl(scopedValue)) {
        invalidPublicEnv.push(`${scopedName}=${scopedValue}`);
      }
    }

    const legacyIndexerUrl = process.env.NEXT_PUBLIC_INDEXER_API_URL;
    if (legacyIndexerUrl && isPrivateOrLocalUrl(legacyIndexerUrl)) {
      invalidPublicEnv.push(`NEXT_PUBLIC_INDEXER_API_URL=${legacyIndexerUrl}`);
    }

    if (invalidPublicEnv.length > 0) {
      throw new Error(
        `Public runtime endpoints must be reachable from Vercel. Invalid values:\n  ${invalidPublicEnv.join("\n  ")}`
      );
    }

    if (missingPublicEnv.length > 0) {
      throw new Error(
        `Missing required public runtime env vars for production build:\n  ${missingPublicEnv.join("\n  ")}`
      );
    }
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Use separate output dir when building, so concurrent next dev doesn't interfere
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Keep the dev compiler footprint tighter on the Raspberry Pi.
  onDemandEntries: {
    maxInactiveAge: 15_000,
    pagesBufferLength: 1
  },
  outputFileTracingRoot: path.join(__dirname, "../.."),
  allowedDevOrigins: ["192.168.1.115", "localhost", "127.0.0.1"],
  // Tree-shake large barrel packages so webpack only resolves the named exports
  // actually used. Dramatically reduces the module graph for wagmi/viem/rainbowkit.
  experimental: {
    optimizePackageImports: ["wagmi", "viem", "@wagmi/core", "@rainbow-me/rainbowkit"]
  },
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@react-native-async-storage/async-storage": false,
      "pino-pretty": false
    };
    // Limit concurrent module builds to reduce peak heap on memory-constrained
    // hosts (e.g. Raspberry Pi running a dev server in parallel).
    config.parallelism = 1;
    return config;
  }
};

export default nextConfig;
