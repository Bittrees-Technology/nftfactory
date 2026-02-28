const REQUIRED_PUBLIC_VARS = [
  "NEXT_PUBLIC_CHAIN_ID",
  "NEXT_PUBLIC_RPC_URL",
  "NEXT_PUBLIC_REGISTRY_ADDRESS",
  "NEXT_PUBLIC_MARKETPLACE_ADDRESS",
  "NEXT_PUBLIC_SHARED_721_ADDRESS",
  "NEXT_PUBLIC_SHARED_1155_ADDRESS",
  "NEXT_PUBLIC_SUBNAME_REGISTRAR_ADDRESS",
  "NEXT_PUBLIC_FACTORY_ADDRESS"
] as const;

export function validateEnv(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const name of REQUIRED_PUBLIC_VARS) {
    if (!process.env[name]) {
      missing.push(name);
    }
  }
  return { valid: missing.length === 0, missing };
}
