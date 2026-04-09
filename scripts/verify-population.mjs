#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function usage() {
  console.log(`Usage:
  npm run verify:population -- --config ./path/to/population-check.json

Config file shape:
{
  "indexerBaseUrl": "https://api.nftfactory.org",
  "webBaseUrl": "https://nftfactory.org",
  "cases": [
    {
      "label": "creator wallet",
      "ownerAddress": "0x...",
      "profileName": "artist.eth",
      "expectedCollections": [
        {
          "contractAddress": "0x...",
          "origin": "shared" | "custom",
          "tokenId": "1",
          "minTokenCount": 1
        }
      ]
    }
  ]
}
`);
}

function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || "").trim());
}

function normalizeAddress(value) {
  return String(value || "").trim().toLowerCase();
}

function readConfig() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    usage();
    process.exit(0);
  }

  const configFlagIndex = argv.findIndex((value) => value === "--config");
  const configPath =
    configFlagIndex >= 0 && argv[configFlagIndex + 1]
      ? resolve(process.cwd(), argv[configFlagIndex + 1])
      : process.env.POPULATION_VERIFICATION_CONFIG
        ? resolve(process.cwd(), process.env.POPULATION_VERIFICATION_CONFIG)
        : null;

  if (!configPath || !existsSync(configPath)) {
    console.error("Missing population verification config. Pass --config <path> or set POPULATION_VERIFICATION_CONFIG.");
    process.exit(1);
  }

  const parsed = JSON.parse(readFileSync(configPath, "utf8"));
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.cases) || parsed.cases.length === 0) {
    console.error("Population verification config must include a non-empty cases array.");
    process.exit(1);
  }

  return parsed;
}

async function fetchJson(baseUrl, path) {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${text || "request failed"}`);
  }

  return response.json();
}

function expect(condition, message, failures) {
  if (!condition) {
    failures.push(message);
  }
}

async function verifyCase(config, item) {
  const failures = [];
  const ownerAddress = normalizeAddress(item.ownerAddress);
  const expectedCollections = Array.isArray(item.expectedCollections) ? item.expectedCollections : [];
  const label = item.label || ownerAddress;

  if (!isAddress(ownerAddress)) {
    throw new Error(`Invalid ownerAddress in case "${label}"`);
  }

  const indexerBaseUrl = String(item.indexerBaseUrl || config.indexerBaseUrl || "").trim();
  const webBaseUrl = String(item.webBaseUrl || config.webBaseUrl || "").trim();

  if (!indexerBaseUrl) {
    throw new Error(`Missing indexerBaseUrl for case "${label}"`);
  }

  const [ownerSummary, collectionsByOwner, ownerHoldings, profileResolution] = await Promise.all([
    fetchJson(indexerBaseUrl, `/api/owners/${encodeURIComponent(ownerAddress)}/summary`),
    fetchJson(indexerBaseUrl, `/api/collections?owner=${encodeURIComponent(ownerAddress)}`),
    fetchJson(indexerBaseUrl, `/api/users/${encodeURIComponent(ownerAddress)}/holdings?limit=100`),
    item.profileName ? fetchJson(indexerBaseUrl, `/api/profile/${encodeURIComponent(item.profileName)}`) : Promise.resolve(null)
  ]);

  expect(Array.isArray(ownerSummary.collections), `${label}: owner summary returned no collections array`, failures);
  expect(Array.isArray(ownerHoldings.items), `${label}: owner holdings returned no items array`, failures);
  expect(Array.isArray(collectionsByOwner.collections), `${label}: collections-by-owner returned no collections array`, failures);

  const summaryCollectionsByAddress = new Map(
    (ownerSummary.collections || []).map((entry) => [normalizeAddress(entry.contractAddress), entry])
  );
  const indexedCollectionsByAddress = new Map(
    (collectionsByOwner.collections || []).map((entry) => [normalizeAddress(entry.contractAddress), entry])
  );
  const holdingsByCollectionAndToken = new Map(
    (ownerHoldings.items || []).map((entry) => [
      `${normalizeAddress(entry.collection?.contractAddress)}:${String(entry.tokenId)}`,
      entry
    ])
  );

  for (const expectedCollection of expectedCollections) {
    const contractAddress = normalizeAddress(expectedCollection.contractAddress);
    const tokenId = String(expectedCollection.tokenId || "").trim();
    const minTokenCount = Number.isInteger(expectedCollection.minTokenCount) ? expectedCollection.minTokenCount : 1;
    const origin = String(expectedCollection.origin || "unknown").trim();

    expect(isAddress(contractAddress), `${label}: invalid expected collection address ${expectedCollection.contractAddress}`, failures);
    expect(summaryCollectionsByAddress.has(contractAddress), `${label}: ${origin} collection missing from /api/owners/:address/summary -> ${contractAddress}`, failures);
    expect(indexedCollectionsByAddress.has(contractAddress), `${label}: ${origin} collection missing from /api/collections?owner= -> ${contractAddress}`, failures);

    const indexedCollection = indexedCollectionsByAddress.get(contractAddress);
    if (indexedCollection) {
      expect(
        Number(indexedCollection.tokenCount || 0) >= minTokenCount,
        `${label}: ${origin} collection ${contractAddress} has tokenCount=${indexedCollection.tokenCount || 0}, expected >= ${minTokenCount}`,
        failures
      );
    }

    const collectionTokens = await fetchJson(indexerBaseUrl, `/api/collections/${encodeURIComponent(contractAddress)}/tokens?sync=1`);
    expect(Array.isArray(collectionTokens.tokens), `${label}: ${origin} collection token scan returned no tokens array for ${contractAddress}`, failures);
    expect(
      Number(collectionTokens.count || 0) >= minTokenCount,
      `${label}: ${origin} collection ${contractAddress} returned count=${collectionTokens.count || 0}, expected >= ${minTokenCount}`,
      failures
    );

    if (tokenId) {
      expect(
        Boolean((collectionTokens.tokens || []).find((entry) => String(entry.tokenId) === tokenId)),
        `${label}: ${origin} collection ${contractAddress} missing token ${tokenId} in /api/collections/:address/tokens`,
        failures
      );
      expect(
        holdingsByCollectionAndToken.has(`${contractAddress}:${tokenId}`),
        `${label}: ${origin} collection ${contractAddress} token ${tokenId} missing from /api/users/:address/holdings`,
        failures
      );
    }
  }

  if (item.profileName) {
    expect(Boolean(profileResolution), `${label}: profile resolution response missing`, failures);
    expect(
      Array.isArray(profileResolution?.sellers) && profileResolution.sellers.some((value) => normalizeAddress(value) === ownerAddress),
      `${label}: profile ${item.profileName} did not resolve owner ${ownerAddress} in sellers`,
      failures
    );
    expect(
      Array.isArray(profileResolution?.collections) && profileResolution.collections.length > 0,
      `${label}: profile ${item.profileName} did not resolve any collections`,
      failures
    );

    if (webBaseUrl) {
      const profileView = await fetchJson(webBaseUrl, `/api/profile/view/${encodeURIComponent(item.profileName)}`);
      expect(
        Array.isArray(profileView.activeSellerAddresses) && profileView.activeSellerAddresses.some((value) => normalizeAddress(value) === ownerAddress),
        `${label}: web profile view ${item.profileName} did not expose owner ${ownerAddress} as an active seller`,
        failures
      );
      expect(
        Array.isArray(profileView.holdings) && profileView.holdings.length > 0,
        `${label}: web profile view ${item.profileName} returned no holdings`,
        failures
      );
    }
  }

  return failures;
}

async function main() {
  const config = readConfig();
  let failedCases = 0;

  for (const item of config.cases) {
    const label = item.label || item.ownerAddress || "unnamed-case";
    console.log(`\nCase: ${label}`);
    try {
      const failures = await verifyCase(config, item);
      if (failures.length === 0) {
        console.log("  PASS population verified");
        continue;
      }

      failedCases += 1;
      for (const failure of failures) {
        console.log(`  FAIL ${failure}`);
      }
    } catch (error) {
      failedCases += 1;
      console.log(`  FAIL ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (failedCases > 0) {
    process.exitCode = 1;
    console.log(`\nPopulation verification failed for ${failedCases} case(s).`);
    return;
  }

  console.log("\nPopulation verification passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
