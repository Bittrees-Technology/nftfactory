import { defineChain, type Chain } from "viem";
import {
  avalanche,
  base,
  ink,
  mainnet,
  monad,
  optimism,
  polygon,
  scroll,
  sepolia,
  unichain
} from "viem/chains";
import {
  getLegacyChainPublicEnv,
  getRootPublicEnv,
  getScopedChainPublicEnv
} from "./publicEnv";

export const anvil = defineChain({
  id: 31337,
  name: "Anvil",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18
  },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"] }
  }
});

const KNOWN_APP_CHAINS: Chain[] = [
  mainnet,
  optimism,
  polygon,
  base,
  ink,
  avalanche,
  unichain,
  monad,
  scroll,
  sepolia,
  anvil
];

const DEFAULT_ENABLED_CHAIN_IDS = [
  mainnet.id,
  optimism.id,
  polygon.id,
  base.id,
  ink.id,
  avalanche.id,
  unichain.id,
  monad.id,
  scroll.id,
  sepolia.id
];

const REQUIRED_CHAIN_ENV_NAMES = [
  "NEXT_PUBLIC_RPC_URL",
  "NEXT_PUBLIC_REGISTRY_ADDRESS",
  "NEXT_PUBLIC_MARKETPLACE_ADDRESS",
  "NEXT_PUBLIC_SHARED_721_ADDRESS",
  "NEXT_PUBLIC_SHARED_1155_ADDRESS",
  "NEXT_PUBLIC_SUBNAME_REGISTRAR_ADDRESS",
  "NEXT_PUBLIC_FACTORY_ADDRESS"
] as const;

function getRequiredEnvNamesForChain(chainId: number): string[] {
  return REQUIRED_CHAIN_ENV_NAMES.map((name) => `${name}_${chainId}`);
}

function getKnownChainMap(): Map<number, Chain> {
  return new Map(KNOWN_APP_CHAINS.map((chain) => [chain.id, chain]));
}

function parseChainIds(value: string | undefined): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => Number.parseInt(entry.trim(), 10))
    .filter((entry) => Number.isInteger(entry) && entry > 0);
}

function getExplicitPrimaryChainId(): number | null {
  const raw = getRootPublicEnv("NEXT_PUBLIC_PRIMARY_CHAIN_ID") || getRootPublicEnv("NEXT_PUBLIC_CHAIN_ID");
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function hasLegacyChainEnv(name: string, chainId: number): boolean {
  const legacyValue = getLegacyChainPublicEnv(name as Parameters<typeof getLegacyChainPublicEnv>[0]);
  if (!legacyValue) return false;
  const explicitPrimaryChainId = getExplicitPrimaryChainId();
  if (explicitPrimaryChainId !== null) {
    return explicitPrimaryChainId === chainId;
  }
  return chainId === mainnet.id;
}

export function isAppChainConfigured(chainId: number): boolean {
  return REQUIRED_CHAIN_ENV_NAMES.every((name) => {
    if (getScopedChainPublicEnv(name, chainId)) return true;
    return hasLegacyChainEnv(name, chainId);
  });
}

export function getMissingAppChainEnvVars(chainId: number): string[] {
  return REQUIRED_CHAIN_ENV_NAMES.flatMap((name) => {
    if (getScopedChainPublicEnv(name, chainId)) return [];
    if (hasLegacyChainEnv(name, chainId)) return [];
    return [`${name}_${chainId}`];
  });
}

export function getEnabledAppChainIds(): number[] {
  const requested = parseChainIds(getRootPublicEnv("NEXT_PUBLIC_ENABLED_CHAIN_IDS"));
  if (requested.length > 0) {
    const known = getKnownChainMap();
    const unknownChainIds = requested.filter((chainId, index) => requested.indexOf(chainId) === index && !known.has(chainId));
    if (unknownChainIds.length > 0) {
      throw new Error(
        `NEXT_PUBLIC_ENABLED_CHAIN_IDS contains unknown chain IDs: ${unknownChainIds.join(", ")}.`
      );
    }

    const unconfiguredChainIds = requested.filter(
      (chainId, index) => requested.indexOf(chainId) === index && !isAppChainConfigured(chainId)
    );
    if (unconfiguredChainIds.length > 0) {
      const details = unconfiguredChainIds
        .map((chainId) => `${chainId} [missing: ${getMissingAppChainEnvVars(chainId).join(", ")}]`)
        .join("; ");
      throw new Error(
        `NEXT_PUBLIC_ENABLED_CHAIN_IDS includes chains that are not fully configured: ${details}.`
      );
    }
  }
  const candidateIds = requested.length > 0 ? requested : DEFAULT_ENABLED_CHAIN_IDS;
  const known = getKnownChainMap();
  return candidateIds.filter(
    (chainId, index) => candidateIds.indexOf(chainId) === index && known.has(chainId) && isAppChainConfigured(chainId)
  );
}

export function getEnabledAppChains(): Chain[] {
  return getEnabledAppChainIds().map((chainId) => getAppChain(chainId));
}

export function getPrimaryAppChainId(): number {
  const explicit = getExplicitPrimaryChainId();
  if (explicit !== null) {
    if (isAppChainConfigured(explicit)) {
      return explicit;
    }
    const missing = getMissingAppChainEnvVars(explicit);
    throw new Error(
      `Primary chain ${explicit} is not fully configured. Missing: ${missing.length ? missing.join(", ") : getRequiredEnvNamesForChain(explicit).join(", ")}.`
    );
  }
  const enabled = getEnabledAppChainIds();
  if (enabled.includes(mainnet.id)) {
    return mainnet.id;
  }
  if (enabled[0]) {
    return enabled[0];
  }
  throw new Error(
    "No configured app chains were found. Set NEXT_PUBLIC_CHAIN_ID or NEXT_PUBLIC_PRIMARY_CHAIN_ID and provide the required NEXT_PUBLIC_* contract env vars for that chain."
  );
}

export function getAppChain(chainId: number) {
  const known = getKnownChainMap().get(chainId);
  if (known) return known;
  return defineChain({
    id: chainId,
    name: `Chain ${chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } }
  });
}

export function getExplorerBaseUrl(chainId: number): string | null {
  return getAppChain(chainId).blockExplorers?.default?.url || null;
}
