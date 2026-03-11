import type { NextConfig } from "next";
import path from "node:path";
import { resolveBasicAuthConfig } from "./lib/basicAuth";
import {
  buildIpfsAuthRequirementError,
  buildIpfsReachabilityError,
  hasIpfsApiAuthConfigured,
  isPrivateOrLocalUrl
} from "./lib/ipfsUpload";

const primaryChainId = process.env.NEXT_PUBLIC_PRIMARY_CHAIN_ID || process.env.NEXT_PUBLIC_CHAIN_ID || "1";

const REQUIRED_PUBLIC_ENV = [
  "NEXT_PUBLIC_RPC_URL",
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

function getActiveProductionChainIds(primaryChainIdValue: string): number[] {
  return Array.from(new Set([Number.parseInt(primaryChainIdValue, 10), ...parseEnabledChainIds()])).filter(Number.isFinite);
}

if (process.env.NODE_ENV === "production") {
  const missing = REQUIRED_PUBLIC_ENV.filter(
    (name) => !process.env[`${name}_${primaryChainId}`] && !process.env[name]
  ).map((name) => `${name}_${primaryChainId}`);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars for production build:\n  ${missing.join("\n  ")}`);
  }

  const basicAuth = resolveBasicAuthConfig(process.env);
  if (basicAuth.misconfigured) {
    throw new Error("SITE_BASIC_AUTH_ENABLED requires SITE_BASIC_AUTH_PASSWORD to be set.");
  }

  if (process.env.VERCEL && process.env.IPFS_API_URL && isPrivateOrLocalUrl(process.env.IPFS_API_URL)) {
    throw new Error(buildIpfsReachabilityError(process.env.IPFS_API_URL));
  }

  if (process.env.VERCEL) {
    const chainIds = getActiveProductionChainIds(primaryChainId);
    const badIndexerEnv: string[] = [];
    const missingIndexerEnv: string[] = [];

    if (!String(process.env.IPFS_API_URL || "").trim()) {
      throw new Error("Missing required env var for production build: IPFS_API_URL");
    }

    if (!isPrivateOrLocalUrl(process.env.IPFS_API_URL) && !hasIpfsApiAuthConfigured(process.env)) {
      throw new Error(buildIpfsAuthRequirementError(process.env.IPFS_API_URL));
    }

    for (const chainId of chainIds) {
      const scopedName = `NEXT_PUBLIC_INDEXER_API_URL_${chainId}`;
      const scopedValue = process.env[scopedName];
      const canUseLegacy = String(chainId) === primaryChainId;
      const fallbackValue = canUseLegacy ? process.env.NEXT_PUBLIC_INDEXER_API_URL : undefined;

      if (!String(scopedValue || "").trim() && !String(fallbackValue || "").trim()) {
        missingIndexerEnv.push(canUseLegacy ? `${scopedName} (or NEXT_PUBLIC_INDEXER_API_URL)` : scopedName);
        continue;
      }

      if (scopedValue && isPrivateOrLocalUrl(scopedValue)) {
        badIndexerEnv.push(`${scopedName}=${scopedValue}`);
      }
    }

    const legacyIndexerUrl = process.env.NEXT_PUBLIC_INDEXER_API_URL;
    if (legacyIndexerUrl && isPrivateOrLocalUrl(legacyIndexerUrl)) {
      badIndexerEnv.push(`NEXT_PUBLIC_INDEXER_API_URL=${legacyIndexerUrl}`);
    }

    if (badIndexerEnv.length > 0) {
      throw new Error(
        `Indexer API URL must be publicly reachable from Vercel. Invalid values:\n  ${badIndexerEnv.join("\n  ")}`
      );
    }

    if (missingIndexerEnv.length > 0) {
      throw new Error(
        `Missing required public indexer env vars for production build:\n  ${missingIndexerEnv.join("\n  ")}`
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
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@react-native-async-storage/async-storage": false,
      "pino-pretty": false
    };
    return config;
  }
};

export default nextConfig;
