import { afterEach, describe, expect, it } from "vitest";
import { getContractsConfig } from "./contracts";

const ORIGINAL_ENV = { ...process.env };

function resetEnv(): void {
  process.env = { ...ORIGINAL_ENV };
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("NEXT_PUBLIC_")) {
      delete process.env[key];
    }
  }
}

function setBaseChainEnv(chainId: number): void {
  process.env.NEXT_PUBLIC_PRIMARY_CHAIN_ID = String(chainId);
  process.env.NEXT_PUBLIC_REGISTRY_ADDRESS_1 = "0x1111111111111111111111111111111111111111";
  process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS_1 = "0x2222222222222222222222222222222222222222";
  process.env.NEXT_PUBLIC_SHARED_721_ADDRESS_1 = "0x3333333333333333333333333333333333333333";
  process.env.NEXT_PUBLIC_SHARED_1155_ADDRESS_1 = "0x4444444444444444444444444444444444444444";
  process.env.NEXT_PUBLIC_SUBNAME_REGISTRAR_ADDRESS_1 = "0x5555555555555555555555555555555555555555";
  process.env.NEXT_PUBLIC_FACTORY_ADDRESS_1 = "0x6666666666666666666666666666666666666666";
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("contracts", () => {
  it("prefers scoped RPC URL lists and keeps the first URL primary", () => {
    resetEnv();
    setBaseChainEnv(1);
    process.env.NEXT_PUBLIC_RPC_URLS_1 = "https://rpc-a.example, https://rpc-b.example";

    const config = getContractsConfig(1);

    expect(config.rpcUrl).toBe("https://rpc-a.example");
    expect(config.rpcUrls).toEqual(["https://rpc-a.example", "https://rpc-b.example"]);
  });

  it("falls back to legacy NEXT_PUBLIC_RPC_URLS for the primary chain", () => {
    resetEnv();
    setBaseChainEnv(1);
    process.env.NEXT_PUBLIC_RPC_URLS = "https://legacy-a.example, https://legacy-b.example";

    const config = getContractsConfig(1);

    expect(config.rpcUrl).toBe("https://legacy-a.example");
    expect(config.rpcUrls).toEqual(["https://legacy-a.example", "https://legacy-b.example"]);
  });
});
