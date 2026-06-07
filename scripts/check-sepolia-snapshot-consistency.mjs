#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = process.cwd();
const defaultSnapshotPath = resolve(rootDir, "docs/deployments.sepolia-app-wired.json");
const snapshotPath = process.env.DEPLOYMENT_SNAPSHOT || defaultSnapshotPath;

if (!existsSync(snapshotPath)) {
  console.error(`Deployment snapshot not found: ${snapshotPath}`);
  process.exit(1);
}

const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
const chainId = String(snapshot.chainId || "11155111").trim();
const contracts = snapshot.contracts || {};

const requiredContractKeys = [
  "registry",
  "royaltySplitRegistry",
  "moderatorRegistry",
  "subnameRegistrar",
  "shared721",
  "shared1155",
  "creatorCollection721Implementation",
  "creatorCollection1155Implementation",
  "factory",
  "marketplace"
];

const missingKeys = requiredContractKeys.filter((key) => !String(contracts[key] || "").trim());
if (missingKeys.length > 0) {
  console.error(`Snapshot is missing required contract keys: ${missingKeys.join(", ")}`);
  process.exit(1);
}

function fileText(relativePath) {
  const absolutePath = resolve(rootDir, relativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing file: ${relativePath}`);
  }

  return readFileSync(absolutePath, "utf8");
}

function envLine(name, value) {
  return `${name}=${value}`;
}

function commentEnvLine(name, value) {
  return `# ${name}=${value}`;
}

const checks = [
  {
    path: "README.md",
    patterns: [
      envLine(`NEXT_PUBLIC_REGISTRY_ADDRESS_${chainId}`, contracts.registry),
      envLine(`NEXT_PUBLIC_ROYALTY_SPLIT_REGISTRY_ADDRESS_${chainId}`, contracts.royaltySplitRegistry),
      envLine(`NEXT_PUBLIC_MODERATOR_REGISTRY_ADDRESS_${chainId}`, contracts.moderatorRegistry),
      envLine(`NEXT_PUBLIC_MARKETPLACE_ADDRESS_${chainId}`, contracts.marketplace),
      envLine(`NEXT_PUBLIC_SHARED_721_ADDRESS_${chainId}`, contracts.shared721),
      envLine(`NEXT_PUBLIC_SHARED_1155_ADDRESS_${chainId}`, contracts.shared1155),
      envLine(`NEXT_PUBLIC_SUBNAME_REGISTRAR_ADDRESS_${chainId}`, contracts.subnameRegistrar),
      envLine(`NEXT_PUBLIC_FACTORY_ADDRESS_${chainId}`, contracts.factory),
      envLine("REGISTRY_ADDRESS", contracts.registry),
      envLine("MARKETPLACE_ADDRESS", contracts.marketplace),
      envLine("MODERATOR_REGISTRY_ADDRESS", contracts.moderatorRegistry),
      envLine("SHARED_721_ADDRESS", contracts.shared721),
      envLine("SHARED_1155_ADDRESS", contracts.shared1155)
    ]
  },
  {
    path: ".env.example",
    patterns: [
      envLine(`NEXT_PUBLIC_REGISTRY_ADDRESS_${chainId}`, contracts.registry),
      envLine(`NEXT_PUBLIC_ROYALTY_SPLIT_REGISTRY_ADDRESS_${chainId}`, contracts.royaltySplitRegistry),
      envLine(`NEXT_PUBLIC_MODERATOR_REGISTRY_ADDRESS_${chainId}`, contracts.moderatorRegistry),
      envLine(`NEXT_PUBLIC_MARKETPLACE_ADDRESS_${chainId}`, contracts.marketplace),
      envLine(`NEXT_PUBLIC_SHARED_721_ADDRESS_${chainId}`, contracts.shared721),
      envLine(`NEXT_PUBLIC_SHARED_1155_ADDRESS_${chainId}`, contracts.shared1155),
      envLine(`NEXT_PUBLIC_SUBNAME_REGISTRAR_ADDRESS_${chainId}`, contracts.subnameRegistrar),
      envLine(`NEXT_PUBLIC_FACTORY_ADDRESS_${chainId}`, contracts.factory),
      commentEnvLine("REGISTRY_ADDRESS", contracts.registry),
      commentEnvLine("MARKETPLACE_ADDRESS", contracts.marketplace),
      commentEnvLine("MODERATOR_REGISTRY_ADDRESS", contracts.moderatorRegistry)
    ]
  },
  {
    path: "apps/web/.env.example",
    patterns: [
      envLine(`NEXT_PUBLIC_REGISTRY_ADDRESS_${chainId}`, contracts.registry),
      envLine(`NEXT_PUBLIC_ROYALTY_SPLIT_REGISTRY_ADDRESS_${chainId}`, contracts.royaltySplitRegistry),
      envLine(`NEXT_PUBLIC_MODERATOR_REGISTRY_ADDRESS_${chainId}`, contracts.moderatorRegistry),
      envLine(`NEXT_PUBLIC_MARKETPLACE_ADDRESS_${chainId}`, contracts.marketplace),
      envLine(`NEXT_PUBLIC_SHARED_721_ADDRESS_${chainId}`, contracts.shared721),
      envLine(`NEXT_PUBLIC_SHARED_1155_ADDRESS_${chainId}`, contracts.shared1155),
      envLine(`NEXT_PUBLIC_SUBNAME_REGISTRAR_ADDRESS_${chainId}`, contracts.subnameRegistrar),
      envLine(`NEXT_PUBLIC_FACTORY_ADDRESS_${chainId}`, contracts.factory)
    ]
  },
  {
    path: "docs/wiki/Deployment-and-Launch.md",
    patterns: [
      `- \`Registry\`: \`${contracts.registry}\``,
      `- \`RoyaltySplitRegistry\`: \`${contracts.royaltySplitRegistry}\``,
      `- \`ModeratorRegistry\`: \`${contracts.moderatorRegistry}\``,
      `- \`SubnameRegistrar\`: \`${contracts.subnameRegistrar}\``,
      `- \`SharedMint721\`: \`${contracts.shared721}\``,
      `- \`SharedMint1155\`: \`${contracts.shared1155}\``,
      `- \`CreatorFactory\`: \`${contracts.factory}\``,
      `- \`Marketplace\`: \`${contracts.marketplace}\``,
      `- \`CreatorCollection721 implementation\`: \`${contracts.creatorCollection721Implementation}\``,
      `- \`CreatorCollection1155 implementation\`: \`${contracts.creatorCollection1155Implementation}\``
    ]
  },
  {
    path: "docs/wiki/Self-Hosted-Sepolia-RPC.md",
    patterns: [
      envLine("REGISTRY_ADDRESS", contracts.registry),
      envLine("MARKETPLACE_ADDRESS", contracts.marketplace),
      envLine("MODERATOR_REGISTRY_ADDRESS", contracts.moderatorRegistry),
      envLine("SHARED_721_ADDRESS", contracts.shared721),
      envLine("SHARED_1155_ADDRESS", contracts.shared1155)
    ]
  },
  {
    path: "services/indexer/.env.example",
    patterns: [
      commentEnvLine("REGISTRY_ADDRESS", contracts.registry),
      commentEnvLine("MARKETPLACE_ADDRESS", contracts.marketplace),
      commentEnvLine("MODERATOR_REGISTRY_ADDRESS", contracts.moderatorRegistry),
      commentEnvLine("SHARED_721_ADDRESS", contracts.shared721),
      commentEnvLine("SHARED_1155_ADDRESS", contracts.shared1155)
    ]
  },
  {
    path: "services/indexer/scripts/bootstrap-sepolia.sh",
    patterns: [
      `${contracts.registry}`,
      `${contracts.marketplace}`,
      `${contracts.shared721}`,
      `${contracts.shared1155}`
    ]
  },
  {
    path: "services/indexer/examples/self-hosted-sepolia.env.example",
    patterns: [
      envLine("REGISTRY_ADDRESS", contracts.registry),
      envLine("MARKETPLACE_ADDRESS", contracts.marketplace),
      envLine("MODERATOR_REGISTRY_ADDRESS", contracts.moderatorRegistry),
      envLine("SHARED_721_ADDRESS", contracts.shared721),
      envLine("SHARED_1155_ADDRESS", contracts.shared1155)
    ]
  },
  {
    path: "services/indexer/examples/alchemy-custom-webhook-filters.example.json",
    patterns: [contracts.registry, contracts.marketplace, contracts.shared721, contracts.shared1155]
  },
  {
    path: "services/indexer/examples/alchemy-webhook-custom-log.example.json",
    patterns: [contracts.registry]
  }
];

let failures = 0;

for (const check of checks) {
  const contents = fileText(check.path);
  const missing = check.patterns.filter((pattern) => !contents.includes(pattern));

  if (missing.length === 0) {
    console.log(`PASS ${check.path}`);
    continue;
  }

  failures += 1;
  console.log(`FAIL ${check.path}`);
  for (const pattern of missing) {
    console.log(`  missing: ${pattern}`);
  }
}

if (failures > 0) {
  process.exit(1);
}
