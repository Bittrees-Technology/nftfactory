import { getPrimaryAppChainId } from "./chains";
import {
  getLegacyChainPublicEnv,
  getRootPublicEnv,
  getScopedChainPublicEnv,
  type ChainScopedPublicEnvName
} from "./publicEnv";

export type ContractsConfig = {
  chainId: number;
  rpcUrl: string;
  indexerApiUrl?: string;
  registry: `0x${string}`;
  royaltySplitRegistry?: `0x${string}`;
  marketplace: `0x${string}`;
  shared721: `0x${string}`;
  shared1155: `0x${string}`;
  subnameRegistrar: `0x${string}`;
  /** CreatorFactory — deploys ERC-1967 proxied ERC-721/1155 creator collections. */
  factory: `0x${string}`;
};

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function requireAddress(name: string, value: string | undefined): `0x${string}` {
  const v = requireEnv(name, value);
  if (!/^0x[a-fA-F0-9]{40}$/.test(v)) {
    throw new Error(`Invalid address in ${name}: ${v}`);
  }
  return v as `0x${string}`;
}

function optionalAddress(name: string, value: string | undefined): `0x${string}` | undefined {
  if (!value) return undefined;
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`Invalid address in ${name}: ${value}`);
  }
  return value as `0x${string}`;
}

function getLegacyChainId(): number | null {
  const raw = getRootPublicEnv("NEXT_PUBLIC_CHAIN_ID");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function getScopedEnv(name: string, chainId: number): string | undefined {
  const scopedValue = getScopedChainPublicEnv(name as ChainScopedPublicEnvName, chainId);
  if (scopedValue) return scopedValue;
  const legacyChainId = getLegacyChainId();
  if ((legacyChainId !== null && legacyChainId === chainId) || (legacyChainId === null && chainId === getPrimaryAppChainId())) {
    return getLegacyChainPublicEnv(name as ChainScopedPublicEnvName);
  }
  return undefined;
}

function requireScopedEnv(name: string, chainId: number): string {
  return requireEnv(`${name}_${chainId}`, getScopedEnv(name, chainId));
}

function requireScopedAddress(name: string, chainId: number): `0x${string}` {
  return requireAddress(`${name}_${chainId}`, getScopedEnv(name, chainId));
}

function optionalScopedAddress(name: string, chainId: number): `0x${string}` | undefined {
  return optionalAddress(`${name}_${chainId}`, getScopedEnv(name, chainId));
}

export function getContractsConfig(chainId = getPrimaryAppChainId()): ContractsConfig {
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`Invalid chainId: ${chainId}`);
  }

  return {
    chainId,
    rpcUrl: requireScopedEnv("NEXT_PUBLIC_RPC_URL", chainId),
    indexerApiUrl: getScopedEnv("NEXT_PUBLIC_INDEXER_API_URL", chainId),
    registry: requireScopedAddress("NEXT_PUBLIC_REGISTRY_ADDRESS", chainId),
    royaltySplitRegistry: optionalScopedAddress("NEXT_PUBLIC_ROYALTY_SPLIT_REGISTRY_ADDRESS", chainId),
    marketplace: requireScopedAddress("NEXT_PUBLIC_MARKETPLACE_ADDRESS", chainId),
    shared721: requireScopedAddress("NEXT_PUBLIC_SHARED_721_ADDRESS", chainId),
    shared1155: requireScopedAddress("NEXT_PUBLIC_SHARED_1155_ADDRESS", chainId),
    subnameRegistrar: requireScopedAddress("NEXT_PUBLIC_SUBNAME_REGISTRAR_ADDRESS", chainId),
    factory: requireScopedAddress("NEXT_PUBLIC_FACTORY_ADDRESS", chainId)
  };
}
