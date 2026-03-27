#!/usr/bin/env node

const PRIMARY_CHAIN_ID = String(
  process.env.NEXT_PUBLIC_PRIMARY_CHAIN_ID || process.env.NEXT_PUBLIC_CHAIN_ID || "1"
).trim();

const REQUIRED_CHAIN_ENV = [
  "NEXT_PUBLIC_RPC_URL",
  "NEXT_PUBLIC_REGISTRY_ADDRESS",
  "NEXT_PUBLIC_MARKETPLACE_ADDRESS",
  "NEXT_PUBLIC_SHARED_721_ADDRESS",
  "NEXT_PUBLIC_SHARED_1155_ADDRESS",
  "NEXT_PUBLIC_SUBNAME_REGISTRAR_ADDRESS",
  "NEXT_PUBLIC_FACTORY_ADDRESS"
];

function isPrivateOrLocalUrl(value) {
  if (!value) return false;
  return /^https?:\/\/(localhost|127\.[0-9]+\.[0-9]+\.[0-9]+|0\.0\.0\.0|\[::1\]|::1)(:|\/|$)/.test(value)
    || /^https?:\/\/10\.[0-9]+\.[0-9]+\.[0-9]+(:|\/|$)/.test(value)
    || /^https?:\/\/192\.168\.[0-9]+\.[0-9]+(:|\/|$)/.test(value)
    || /^https?:\/\/172\.([1][6-9]|2[0-9]|3[0-1])\.[0-9]+\.[0-9]+(:|\/|$)/.test(value);
}

function isTruthyEnvFlag(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function parseEnabledChainIds() {
  const raw = String(process.env.NEXT_PUBLIC_ENABLED_CHAIN_IDS || "").trim();
  if (!raw) return [PRIMARY_CHAIN_ID].filter(Boolean);
  return [...new Set(raw.split(",").map((value) => value.trim()).filter(Boolean))];
}

function readChainValue(name, chainId) {
  return String(process.env[`${name}_${chainId}`] || "").trim()
    || (String(chainId) === PRIMARY_CHAIN_ID ? String(process.env[name] || "").trim() : "");
}

function validate() {
  const chainIds = parseEnabledChainIds();
  const missing = [];
  const warnings = [];

  if (!PRIMARY_CHAIN_ID) {
    missing.push("NEXT_PUBLIC_PRIMARY_CHAIN_ID (or NEXT_PUBLIC_CHAIN_ID)");
  }

  for (const chainId of chainIds) {
    for (const name of REQUIRED_CHAIN_ENV) {
      if (!readChainValue(name, chainId)) {
        missing.push(`${name}_${chainId}`);
      }
    }

    const indexerValue = readChainValue("NEXT_PUBLIC_INDEXER_API_URL", chainId);
    if (!indexerValue) {
      missing.push(
        String(chainId) === PRIMARY_CHAIN_ID
          ? `NEXT_PUBLIC_INDEXER_API_URL_${chainId} (or NEXT_PUBLIC_INDEXER_API_URL)`
          : `NEXT_PUBLIC_INDEXER_API_URL_${chainId}`
      );
    } else if (process.env.VERCEL && isPrivateOrLocalUrl(indexerValue)) {
      warnings.push(`NEXT_PUBLIC_INDEXER_API_URL_${chainId} is private/local: ${indexerValue}`);
    }
  }

  const ipfsApiUrl = String(process.env.IPFS_API_URL || "").trim();
  if (process.env.VERCEL) {
    if (!ipfsApiUrl) {
      missing.push("IPFS_API_URL");
    } else if (isPrivateOrLocalUrl(ipfsApiUrl)) {
      warnings.push(`IPFS_API_URL is private/local: ${ipfsApiUrl}`);
    } else if (!isTruthyEnvFlag(process.env.ALLOW_PUBLIC_IPFS_API_WITHOUT_AUTH)
      && !String(process.env.IPFS_API_BEARER_TOKEN || "").trim()
      && !(String(process.env.IPFS_API_BASIC_AUTH_USERNAME || "").trim()
        && String(process.env.IPFS_API_BASIC_AUTH_PASSWORD || "").trim())) {
      warnings.push("Public IPFS_API_URL is unauthenticated. Set IPFS_API_BEARER_TOKEN, both IPFS_API_BASIC_AUTH variables, or ALLOW_PUBLIC_IPFS_API_WITHOUT_AUTH=1.");
    }
  }

  if (missing.length > 0) {
    console.error("Missing required web build env vars:");
    for (const name of missing) {
      console.error(`- ${name}`);
    }
  }

  if (warnings.length > 0) {
    console.error("Public reachability warnings:");
    for (const warning of warnings) {
      console.error(`- ${warning}`);
    }
  }

  if (missing.length > 0 || warnings.length > 0) {
    process.exitCode = 1;
    return;
  }

  console.log("Web build env check passed.");
  console.log(`Primary chain: ${PRIMARY_CHAIN_ID}`);
  console.log(`Enabled chains: ${chainIds.join(", ")}`);
}

validate();
