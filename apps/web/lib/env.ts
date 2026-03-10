import { getMissingAppChainEnvVars, getPrimaryAppChainId } from "./chains";

const REQUIRED_PUBLIC_VARS = [
  "NEXT_PUBLIC_RPC_URL",
  "NEXT_PUBLIC_REGISTRY_ADDRESS",
  "NEXT_PUBLIC_MARKETPLACE_ADDRESS",
  "NEXT_PUBLIC_SHARED_721_ADDRESS",
  "NEXT_PUBLIC_SHARED_1155_ADDRESS",
  "NEXT_PUBLIC_SUBNAME_REGISTRAR_ADDRESS",
  "NEXT_PUBLIC_FACTORY_ADDRESS"
] as const;

export function validateEnv(): { valid: boolean; missing: string[] } {
  const primaryChainId = getPrimaryAppChainId();
  const missing = getMissingAppChainEnvVars(primaryChainId).filter((name) =>
    REQUIRED_PUBLIC_VARS.some((requiredName) => name === `${requiredName}_${primaryChainId}`)
  );
  return { valid: missing.length === 0, missing };
}
