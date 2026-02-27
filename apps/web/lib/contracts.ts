export type ContractsConfig = {
  chainId: number;
  rpcUrl: string;
  registry: `0x${string}`;
  marketplace: `0x${string}`;
  shared721: `0x${string}`;
  shared1155: `0x${string}`;
  subnameRegistrar: `0x${string}`;
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

export function getContractsConfig(): ContractsConfig {
  const chainIdRaw = requireEnv("NEXT_PUBLIC_CHAIN_ID", process.env.NEXT_PUBLIC_CHAIN_ID);
  const chainId = Number(chainIdRaw);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`Invalid NEXT_PUBLIC_CHAIN_ID: ${chainIdRaw}`);
  }

  return {
    chainId,
    rpcUrl: requireEnv("NEXT_PUBLIC_RPC_URL", process.env.NEXT_PUBLIC_RPC_URL),
    registry: requireAddress("NEXT_PUBLIC_REGISTRY_ADDRESS", process.env.NEXT_PUBLIC_REGISTRY_ADDRESS),
    marketplace: requireAddress("NEXT_PUBLIC_MARKETPLACE_ADDRESS", process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS),
    shared721: requireAddress("NEXT_PUBLIC_SHARED_721_ADDRESS", process.env.NEXT_PUBLIC_SHARED_721_ADDRESS),
    shared1155: requireAddress("NEXT_PUBLIC_SHARED_1155_ADDRESS", process.env.NEXT_PUBLIC_SHARED_1155_ADDRESS),
    subnameRegistrar: requireAddress(
      "NEXT_PUBLIC_SUBNAME_REGISTRAR_ADDRESS",
      process.env.NEXT_PUBLIC_SUBNAME_REGISTRAR_ADDRESS
    )
  };
}
