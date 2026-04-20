const DEFAULT_WALLETCONNECT_PROJECT_ID = "e63eaf5138df1d6c053f2b91cfb0ee5c";

function normalizeEnvValue(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function resolveConfiguredWalletConnectProjectId(
  env: NodeJS.ProcessEnv = process.env
): string {
  return (
    normalizeEnvValue(env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID) ||
    normalizeEnvValue(env.WALLETCONNECT_PROJECT_ID)
  );
}

export function hasConfiguredWalletConnectProjectId(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return Boolean(resolveConfiguredWalletConnectProjectId(env));
}

export function isUsingDefaultWalletConnectProjectId(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return !hasConfiguredWalletConnectProjectId(env) && env.NODE_ENV !== "production";
}

export function resolveWalletConnectProjectId(
  env: NodeJS.ProcessEnv = process.env
): string {
  return resolveConfiguredWalletConnectProjectId(env) || DEFAULT_WALLETCONNECT_PROJECT_ID;
}

