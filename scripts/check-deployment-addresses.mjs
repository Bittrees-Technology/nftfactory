#!/usr/bin/env node
import { createPublicClient, getAddress, http } from 'viem';

const chainId = Number.parseInt(
  String(process.env.NEXT_PUBLIC_PRIMARY_CHAIN_ID || process.env.NEXT_PUBLIC_CHAIN_ID || process.env.CHAIN_ID || '11155111'),
  10
);

function readScoped(name, id, { allowLegacy = true } = {}) {
  const scoped = String(process.env[`${name}_${id}`] || '').trim();
  if (scoped) return scoped;
  if (allowLegacy) {
    const legacy = String(process.env[name] || '').trim();
    if (legacy) return legacy;
  }
  return '';
}

function readAddress(name, id, options) {
  const value = readScoped(name, id, options);
  if (!value) return '';
  return getAddress(value);
}

function readRpcUrl(id) {
  return (
    readScoped('NEXT_PUBLIC_RPC_URL', id)
    || String(process.env.RPC_URL || '').trim()
    || String(process.env.SEPOLIA_RPC_URL || '').trim()
  );
}

const deployment = {
  registry: readAddress('NEXT_PUBLIC_REGISTRY_ADDRESS', chainId),
  royaltySplitRegistry: readAddress('NEXT_PUBLIC_ROYALTY_SPLIT_REGISTRY_ADDRESS', chainId),
  moderatorRegistry: readAddress('NEXT_PUBLIC_MODERATOR_REGISTRY_ADDRESS', chainId) || String(process.env.MODERATOR_REGISTRY_ADDRESS || '').trim(),
  subnameRegistrar: readAddress('NEXT_PUBLIC_SUBNAME_REGISTRAR_ADDRESS', chainId),
  shared721: readAddress('NEXT_PUBLIC_SHARED_721_ADDRESS', chainId),
  shared1155: readAddress('NEXT_PUBLIC_SHARED_1155_ADDRESS', chainId),
  factory: readAddress('NEXT_PUBLIC_FACTORY_ADDRESS', chainId),
  marketplace: readAddress('NEXT_PUBLIC_MARKETPLACE_ADDRESS', chainId),
};

const rpcUrl = readRpcUrl(chainId);

if (!Number.isInteger(chainId) || chainId <= 0) {
  console.error('Invalid chain id. Set NEXT_PUBLIC_PRIMARY_CHAIN_ID, NEXT_PUBLIC_CHAIN_ID, or CHAIN_ID.');
  process.exit(1);
}

if (!rpcUrl) {
  console.error(`Missing RPC URL for chain ${chainId}. Set NEXT_PUBLIC_RPC_URL_${chainId}, RPC_URL, or SEPOLIA_RPC_URL.`);
  process.exit(1);
}

const required = [
  ['registry', deployment.registry],
  ['subnameRegistrar', deployment.subnameRegistrar],
  ['shared721', deployment.shared721],
  ['shared1155', deployment.shared1155],
  ['factory', deployment.factory],
  ['marketplace', deployment.marketplace]
];

const missing = required.filter(([, value]) => !value).map(([name]) => name);
if (missing.length > 0) {
  console.error(`Missing required deployment env values for chain ${chainId}: ${missing.join(', ')}`);
  process.exit(1);
}

const client = createPublicClient({ transport: http(rpcUrl) });

const ownedAbi = [
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'pendingOwner', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }
];
const registryAbi = [
  ...ownedAbi,
  { type: 'function', name: 'treasury', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'protocolFeeBps', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'authorizedFactory', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'bool' }] }
];
const registrarAbi = [
  ...ownedAbi,
  { type: 'function', name: 'treasury', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'authorizedMinter', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'bool' }] }
];
const factoryAbi = [
  ...ownedAbi,
  { type: 'function', name: 'registry', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'implementation721', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'implementation1155', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }
];
const marketplaceAbi = [
  ...ownedAbi,
  { type: 'function', name: 'registry', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }
];

async function getCodeStatus(label, address) {
  const code = await client.getCode({ address });
  const ok = Boolean(code && code !== '0x');
  return { label, ok, detail: ok ? `${address} code present` : `${address} has no deployed code` };
}

async function safeRead(label, fn) {
  try {
    const value = await fn();
    return { label, ok: true, detail: String(value) };
  } catch (error) {
    return {
      label,
      ok: false,
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

const checks = [];
for (const [label, address] of Object.entries(deployment)) {
  if (!address) continue;
  checks.push(await getCodeStatus(label, address));
}

checks.push(await safeRead('registry.owner', () => client.readContract({ address: deployment.registry, abi: registryAbi, functionName: 'owner' })));
checks.push(await safeRead('registry.pendingOwner', () => client.readContract({ address: deployment.registry, abi: registryAbi, functionName: 'pendingOwner' })));
checks.push(await safeRead('registry.treasury', () => client.readContract({ address: deployment.registry, abi: registryAbi, functionName: 'treasury' })));
checks.push(await safeRead('registry.protocolFeeBps', () => client.readContract({ address: deployment.registry, abi: registryAbi, functionName: 'protocolFeeBps' })));
checks.push(await safeRead('registry.authorizedFactory(factory)', () => client.readContract({ address: deployment.registry, abi: registryAbi, functionName: 'authorizedFactory', args: [deployment.factory] })));

checks.push(await safeRead('registrar.owner', () => client.readContract({ address: deployment.subnameRegistrar, abi: registrarAbi, functionName: 'owner' })));
checks.push(await safeRead('registrar.treasury', () => client.readContract({ address: deployment.subnameRegistrar, abi: registrarAbi, functionName: 'treasury' })));
checks.push(await safeRead('registrar.authorizedMinter(shared721)', () => client.readContract({ address: deployment.subnameRegistrar, abi: registrarAbi, functionName: 'authorizedMinter', args: [deployment.shared721] })));
checks.push(await safeRead('registrar.authorizedMinter(shared1155)', () => client.readContract({ address: deployment.subnameRegistrar, abi: registrarAbi, functionName: 'authorizedMinter', args: [deployment.shared1155] })));

checks.push(await safeRead('factory.owner', () => client.readContract({ address: deployment.factory, abi: factoryAbi, functionName: 'owner' })));
checks.push(await safeRead('factory.registry', () => client.readContract({ address: deployment.factory, abi: factoryAbi, functionName: 'registry' })));
checks.push(await safeRead('factory.implementation721', () => client.readContract({ address: deployment.factory, abi: factoryAbi, functionName: 'implementation721' })));
checks.push(await safeRead('factory.implementation1155', () => client.readContract({ address: deployment.factory, abi: factoryAbi, functionName: 'implementation1155' })));

checks.push(await safeRead('marketplace.owner', () => client.readContract({ address: deployment.marketplace, abi: marketplaceAbi, functionName: 'owner' })));
checks.push(await safeRead('marketplace.registry', () => client.readContract({ address: deployment.marketplace, abi: marketplaceAbi, functionName: 'registry' })));

if (deployment.royaltySplitRegistry) {
  checks.push(await safeRead('royaltySplitRegistry.owner', () => client.readContract({ address: deployment.royaltySplitRegistry, abi: ownedAbi, functionName: 'owner' })));
}

if (deployment.moderatorRegistry) {
  checks.push(await safeRead('moderatorRegistry.owner', () => client.readContract({ address: deployment.moderatorRegistry, abi: ownedAbi, functionName: 'owner' })));
}

console.log(`Deployment verification for chain ${chainId}`);
console.log(`RPC: ${rpcUrl}`);
console.log('');

let failures = 0;
for (const check of checks) {
  if (!check.ok) failures += 1;
  console.log(`- ${check.ok ? 'PASS' : 'FAIL'} ${check.label}: ${check.detail}`);
}

if (failures > 0) {
  process.exitCode = 1;
}
