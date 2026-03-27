#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_SNAPSHOT_PATH = resolve(process.cwd(), 'docs/deployments.sepolia-app-wired.json');
const mode = (process.argv[2] || 'all').trim().toLowerCase();
const snapshotPath = process.env.DEPLOYMENT_SNAPSHOT || DEFAULT_SNAPSHOT_PATH;

if (!existsSync(snapshotPath)) {
  console.error(`Deployment snapshot not found: ${snapshotPath}`);
  process.exit(1);
}

const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
const chainId = Number.parseInt(String(snapshot.chainId || '11155111'), 10);
const contracts = snapshot.contracts || {};

function printBlock(title, entries) {
  console.log(`# ${title}`);
  for (const [key, value] of entries) {
    console.log(`${key}=${value}`);
  }
  console.log('');
}

const webEntries = [
  ['NEXT_PUBLIC_PRIMARY_CHAIN_ID', String(chainId)],
  ['NEXT_PUBLIC_ENABLED_CHAIN_IDS', String(chainId)],
  [`NEXT_PUBLIC_REGISTRY_ADDRESS_${chainId}`, contracts.registry || ''],
  [`NEXT_PUBLIC_ROYALTY_SPLIT_REGISTRY_ADDRESS_${chainId}`, contracts.royaltySplitRegistry || ''],
  [`NEXT_PUBLIC_MODERATOR_REGISTRY_ADDRESS_${chainId}`, contracts.moderatorRegistry || ''],
  [`NEXT_PUBLIC_MARKETPLACE_ADDRESS_${chainId}`, contracts.marketplace || ''],
  [`NEXT_PUBLIC_SHARED_721_ADDRESS_${chainId}`, contracts.shared721 || ''],
  [`NEXT_PUBLIC_SHARED_1155_ADDRESS_${chainId}`, contracts.shared1155 || ''],
  [`NEXT_PUBLIC_SUBNAME_REGISTRAR_ADDRESS_${chainId}`, contracts.subnameRegistrar || ''],
  [`NEXT_PUBLIC_FACTORY_ADDRESS_${chainId}`, contracts.factory || ''],
  [`NEXT_PUBLIC_RPC_URL_${chainId}`, ''],
  [`NEXT_PUBLIC_INDEXER_API_URL_${chainId}`, ''],
  ['IPFS_API_URL', ''],
  ['IPFS_API_BEARER_TOKEN', ''],
  ['IPFS_API_BASIC_AUTH_USERNAME', ''],
  ['IPFS_API_BASIC_AUTH_PASSWORD', ''],
  ['ALLOW_PUBLIC_IPFS_API_WITHOUT_AUTH', '']
];

const indexerEntries = [
  ['CHAIN_ID', String(chainId)],
  ['REGISTRY_ADDRESS', contracts.registry || ''],
  ['MARKETPLACE_ADDRESS', contracts.marketplace || ''],
  ['MODERATOR_REGISTRY_ADDRESS', contracts.moderatorRegistry || ''],
  ['RPC_URL', '']
];

switch (mode) {
  case 'web':
    printBlock(`web env from ${snapshotPath}`, webEntries);
    break;
  case 'indexer':
    printBlock(`indexer env from ${snapshotPath}`, indexerEntries);
    break;
  case 'all':
    printBlock(`web env from ${snapshotPath}`, webEntries);
    printBlock(`indexer env from ${snapshotPath}`, indexerEntries);
    break;
  default:
    console.error(`Unsupported mode: ${mode}. Use one of: all, web, indexer.`);
    process.exit(1);
}
