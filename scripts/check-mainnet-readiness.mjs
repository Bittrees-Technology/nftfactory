#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const STRICT = process.argv.includes("--strict");
const JSON_OUTPUT = process.argv.includes("--json");

const MAINNET_CHAIN_ID = "1";
const REQUIRED_MAINNET_WEB_ADDRESSES = [
  "NEXT_PUBLIC_REGISTRY_ADDRESS_1",
  "NEXT_PUBLIC_ROYALTY_SPLIT_REGISTRY_ADDRESS_1",
  "NEXT_PUBLIC_MODERATOR_REGISTRY_ADDRESS_1",
  "NEXT_PUBLIC_MARKETPLACE_ADDRESS_1",
  "NEXT_PUBLIC_SHARED_721_ADDRESS_1",
  "NEXT_PUBLIC_SHARED_1155_ADDRESS_1",
  "NEXT_PUBLIC_SUBNAME_REGISTRAR_ADDRESS_1",
  "NEXT_PUBLIC_FACTORY_ADDRESS_1"
];

const REQUIRED_INDEXER_ENV = [
  "CHAIN_ID",
  "RPC_URL",
  "REGISTRY_ADDRESS",
  "MARKETPLACE_ADDRESS"
];

function parseDotEnv(pathname) {
  if (!existsSync(pathname)) return {};
  const env = {};
  for (const line of readFileSync(pathname, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

const envFile = parseDotEnv(resolve(ROOT, ".env"));
const env = { ...envFile, ...process.env };

function value(key) {
  return String(env[key] ?? "").trim();
}

function hasAny(keys) {
  return keys.some((key) => value(key));
}

function isTruthy(valueLike) {
  return ["1", "true", "yes", "on"].includes(String(valueLike || "").trim().toLowerCase());
}

function isPrivateOrLocalUrl(urlLike) {
  return /^https?:\/\/(localhost|127\.[0-9]+\.[0-9]+\.[0-9]+|0\.0\.0\.0|\[::1\]|::1)(:|\/|$)/.test(urlLike)
    || /^https?:\/\/10\.[0-9]+\.[0-9]+\.[0-9]+(:|\/|$)/.test(urlLike)
    || /^https?:\/\/192\.168\.[0-9]+\.[0-9]+(:|\/|$)/.test(urlLike)
    || /^https?:\/\/172\.([1][6-9]|2[0-9]|3[0-1])\.[0-9]+\.[0-9]+(:|\/|$)/.test(urlLike);
}

function gitStatus() {
  try {
    return execFileSync("git", ["status", "--porcelain"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim().split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

function row(status, area, check, detail, nextAction) {
  return { status, area, check, detail, nextAction };
}

function buildRows() {
  const rows = [];
  const dirty = gitStatus();
  const primaryChain = value("NEXT_PUBLIC_PRIMARY_CHAIN_ID") || value("NEXT_PUBLIC_CHAIN_ID") || value("CHAIN_ID");
  const enabledChains = value("NEXT_PUBLIC_ENABLED_CHAIN_IDS");
  const missingWebAddresses = REQUIRED_MAINNET_WEB_ADDRESSES.filter((key) => !value(key));
  const missingIndexer = REQUIRED_INDEXER_ENV.filter((key) => !value(key));
  const mainnetRpcPresent = hasAny(["NEXT_PUBLIC_RPC_URL_1", "NEXT_PUBLIC_RPC_URLS_1", "NEXT_PUBLIC_RPC_URL", "RPC_URL", "RPC_URLS"]);
  const indexerUrl = value("NEXT_PUBLIC_INDEXER_API_URL_1") || value("NEXT_PUBLIC_INDEXER_API_URL");
  const ipfsUrl = value("IPFS_API_URL") || value("IPFS_API_URLS") || value("IPFS_API_BASE_URL");
  const ipfsAuth = value("IPFS_API_BEARER_TOKEN")
    || (value("IPFS_API_BASIC_AUTH_USERNAME") && value("IPFS_API_BASIC_AUTH_PASSWORD"))
    || isTruthy(value("ALLOW_PUBLIC_IPFS_API_WITHOUT_AUTH"));
  const adminProtected = value("INDEXER_ADMIN_TOKEN") || value("INDEXER_ADMIN_ALLOWLIST");

  rows.push(dirty.length === 0
    ? row("pass", "repo", "working tree", "no local changes detected", "keep release branch clean for cutover")
    : row("blocker", "repo", "working tree", `${dirty.length} local change(s) or untracked file(s) detected`, "review, commit, or intentionally defer local changes before release"));

  rows.push(primaryChain === MAINNET_CHAIN_ID
    ? row("pass", "env", "primary chain", "mainnet chain id is selected", "keep web and indexer chain ids aligned")
    : row("blocker", "env", "primary chain", `current primary chain is ${primaryChain || "unset"}, not 1`, "set NEXT_PUBLIC_PRIMARY_CHAIN_ID=1 and CHAIN_ID=1 for mainnet cutover"));

  rows.push(enabledChains.split(",").map((item) => item.trim()).filter(Boolean).includes(MAINNET_CHAIN_ID)
    ? row("pass", "env", "enabled chains", "mainnet is enabled", "confirm no unintended testnet-only UI remains")
    : row("blocker", "env", "enabled chains", "mainnet is not listed in NEXT_PUBLIC_ENABLED_CHAIN_IDS", "set NEXT_PUBLIC_ENABLED_CHAIN_IDS=1 for the cutover build"));

  rows.push(mainnetRpcPresent
    ? row("pass", "rpc", "mainnet rpc", "at least one mainnet RPC env key is present", "run npm run check:rpc-policy with production RPC values")
    : row("blocker", "rpc", "mainnet rpc", "no mainnet RPC env key detected", "set NEXT_PUBLIC_RPC_URL_1, NEXT_PUBLIC_RPC_URLS_1, RPC_URL, or RPC_URLS"));

  rows.push(missingWebAddresses.length === 0
    ? row("pass", "contracts", "web address set", "all scoped mainnet NEXT_PUBLIC_* address keys are present", "run npm run check:deployments after broadcast")
    : row("blocker", "contracts", "web address set", `${missingWebAddresses.length} scoped mainnet address key(s) missing`, `fill ${missingWebAddresses.slice(0, 4).join(", ")}${missingWebAddresses.length > 4 ? ", ..." : ""}`));

  rows.push(missingIndexer.length === 0
    ? row("pass", "indexer", "indexer env", "required indexer chain/address keys are present", "verify indexer health reports the same address set")
    : row("blocker", "indexer", "indexer env", `${missingIndexer.length} indexer key(s) missing`, `fill ${missingIndexer.join(", ")}`));

  rows.push(indexerUrl && !isPrivateOrLocalUrl(indexerUrl)
    ? row("pass", "indexer", "public indexer url", "indexer URL is public-reachable by shape", "run npm run check:runtime-health")
    : row("blocker", "indexer", "public indexer url", indexerUrl ? `indexer URL is private/local: ${indexerUrl}` : "indexer URL is unset", "set NEXT_PUBLIC_INDEXER_API_URL_1 or NEXT_PUBLIC_INDEXER_API_URL to the production API host"));

  rows.push(ipfsUrl && !isPrivateOrLocalUrl(ipfsUrl)
    ? row("pass", "ipfs", "writable ipfs url", "IPFS API URL is public-reachable by shape", "run npm run check:ipfs:backend")
    : row("blocker", "ipfs", "writable ipfs url", ipfsUrl ? `IPFS URL is private/local: ${ipfsUrl}` : "IPFS URL is unset", "set IPFS_API_URL or IPFS_API_URLS to the production writable endpoint"));

  rows.push(ipfsAuth
    ? row("pass", "ipfs", "ipfs auth posture", "IPFS auth or explicit public override is configured", "keep public IPFS API bearer-protected unless intentionally public")
    : row("blocker", "ipfs", "ipfs auth posture", "no IPFS auth or explicit public override detected", "set IPFS_API_BEARER_TOKEN, basic auth vars, or ALLOW_PUBLIC_IPFS_API_WITHOUT_AUTH=1"));

  rows.push(adminProtected
    ? row("pass", "admin", "indexer admin protection", "admin token or allowlist is configured", "confirm /health reports adminProtection.protected=true")
    : row("blocker", "admin", "indexer admin protection", "no indexer admin protection env detected", "set INDEXER_ADMIN_TOKEN or INDEXER_ADMIN_ALLOWLIST"));

  rows.push(value("TREASURY_SAFE")
    ? row("pass", "governance", "treasury safe", "TREASURY_SAFE is configured", "verify protocol owner transfer plan before launch")
    : row("blocker", "governance", "treasury safe", "TREASURY_SAFE is unset", "set the production Safe address before ownership transfer"));

  rows.push(value("ETHERSCAN_API_KEY")
    ? row("pass", "verification", "etherscan api key", "ETHERSCAN_API_KEY is configured", "verify contracts and proxy implementations after broadcast")
    : row("warn", "verification", "etherscan api key", "ETHERSCAN_API_KEY is unset", "set before mainnet broadcast if automatic verification is expected"));

  rows.push(row(
    "info",
    "operator",
    "required live checks",
    "network checks are not run by this static report",
    "run npm run check:release, npm run check:deployments, npm run check:runtime-health, npm run check:public-routes, and record Sepolia acceptance before mainnet"
  ));

  return rows;
}

function summarize(rows) {
  return {
    blockers: rows.filter((item) => item.status === "blocker").length,
    warnings: rows.filter((item) => item.status === "warn").length,
    passes: rows.filter((item) => item.status === "pass").length,
    info: rows.filter((item) => item.status === "info").length
  };
}

function printMarkdown(rows) {
  const summary = summarize(rows);
  console.log("# NFTFactory Mainnet Readiness");
  console.log("");
  console.log(`Status: ${summary.blockers === 0 ? "ready-for-live-verification" : "blocked"}`);
  console.log(`Blockers: ${summary.blockers}`);
  console.log(`Warnings: ${summary.warnings}`);
  console.log("");
  console.log("| Status | Area | Check | Detail | Next action |");
  console.log("|---|---|---|---|---|");
  for (const item of rows) {
    console.log(`| ${item.status} | ${item.area} | ${item.check} | ${item.detail.replaceAll("|", "\\|")} | ${item.nextAction.replaceAll("|", "\\|")} |`);
  }
}

const rows = buildRows();
const summary = summarize(rows);

if (JSON_OUTPUT) {
  console.log(JSON.stringify({ summary, rows }, null, 2));
} else {
  printMarkdown(rows);
}

if (STRICT && (summary.blockers > 0 || summary.warnings > 0)) {
  process.exit(1);
}
