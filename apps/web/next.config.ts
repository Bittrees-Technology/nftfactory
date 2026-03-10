import type { NextConfig } from "next";
import path from "node:path";
import { resolveBasicAuthConfig } from "./lib/basicAuth";

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
