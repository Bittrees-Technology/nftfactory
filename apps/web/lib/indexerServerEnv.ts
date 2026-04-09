import { getLegacyChainPublicEnv, getScopedChainPublicEnv } from "./publicEnv";

function normalize(value: string | undefined | null): string | undefined {
  const trimmed = String(value || "").trim();
  return trimmed || undefined;
}

export function getScopedIndexerServerUrl(chainId: number): string | undefined {
  return normalize(process.env[`INDEXER_API_URL_${chainId}`]);
}

export function getLegacyIndexerServerUrl(): string | undefined {
  return normalize(process.env.INDEXER_API_URL);
}

export function resolveIndexerServerUrl(chainId?: number): string | undefined {
  if (typeof chainId === "number" && Number.isInteger(chainId) && chainId > 0) {
    return (
      getScopedIndexerServerUrl(chainId) ||
      getScopedChainPublicEnv("NEXT_PUBLIC_INDEXER_API_URL", chainId) ||
      getLegacyIndexerServerUrl()
    );
  }

  return getLegacyIndexerServerUrl() || getLegacyChainPublicEnv("NEXT_PUBLIC_INDEXER_API_URL");
}
