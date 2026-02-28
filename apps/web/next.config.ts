import type { NextConfig } from "next";
import path from "node:path";

const REQUIRED_PUBLIC_ENV = [
  "NEXT_PUBLIC_CHAIN_ID",
  "NEXT_PUBLIC_RPC_URL",
  "NEXT_PUBLIC_REGISTRY_ADDRESS",
  "NEXT_PUBLIC_MARKETPLACE_ADDRESS",
  "NEXT_PUBLIC_SHARED_721_ADDRESS",
  "NEXT_PUBLIC_SHARED_1155_ADDRESS",
  "NEXT_PUBLIC_SUBNAME_REGISTRAR_ADDRESS",
  "NEXT_PUBLIC_FACTORY_ADDRESS"
];

if (process.env.NODE_ENV === "production") {
  const missing = REQUIRED_PUBLIC_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars for production build:\n  ${missing.join("\n  ")}`);
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, "../..")
};

export default nextConfig;
