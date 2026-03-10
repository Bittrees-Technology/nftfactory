import { afterEach, describe, expect, it } from "vitest";
import {
  getEnabledAppChainIds,
  getMissingAppChainEnvVars,
  getPrimaryAppChainId,
  isAppChainConfigured
} from "./chains";

const REQUIRED_CHAIN_ENV_NAMES = [
  "NEXT_PUBLIC_RPC_URL",
  "NEXT_PUBLIC_REGISTRY_ADDRESS",
  "NEXT_PUBLIC_MARKETPLACE_ADDRESS",
  "NEXT_PUBLIC_SHARED_721_ADDRESS",
  "NEXT_PUBLIC_SHARED_1155_ADDRESS",
  "NEXT_PUBLIC_SUBNAME_REGISTRAR_ADDRESS",
  "NEXT_PUBLIC_FACTORY_ADDRESS"
] as const;

const ORIGINAL_ENV = { ...process.env };

function resetChainEnv(): void {
  process.env = { ...ORIGINAL_ENV };
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("NEXT_PUBLIC_")) {
      delete process.env[key];
    }
  }
}

function setChainEnv(chainId: number): void {
  process.env.NEXT_PUBLIC_CHAIN_ID = String(chainId);
  for (const name of REQUIRED_CHAIN_ENV_NAMES) {
    if (name === "NEXT_PUBLIC_RPC_URL") {
      process.env[name] = `https://rpc-${chainId}.example`;
      continue;
    }
    process.env[name] = `0x${String(chainId).padStart(40, "0")}`;
  }
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("chains", () => {
  it("recognizes a fully configured legacy primary chain", () => {
    resetChainEnv();
    setChainEnv(11155111);

    expect(isAppChainConfigured(11155111)).toBe(true);
    expect(getMissingAppChainEnvVars(11155111)).toEqual([]);
    expect(getEnabledAppChainIds()).toEqual([11155111]);
    expect(getPrimaryAppChainId()).toBe(11155111);
  });

  it("throws when explicitly enabled chains are not fully configured", () => {
    resetChainEnv();
    setChainEnv(11155111);
    process.env.NEXT_PUBLIC_ENABLED_CHAIN_IDS = "11155111,1";

    expect(() => getEnabledAppChainIds()).toThrow(/NEXT_PUBLIC_ENABLED_CHAIN_IDS includes chains that are not fully configured/);
  });

  it("throws when the explicit primary chain is missing required env vars", () => {
    resetChainEnv();
    process.env.NEXT_PUBLIC_PRIMARY_CHAIN_ID = "1";
    process.env.NEXT_PUBLIC_RPC_URL_1 = "https://rpc-1.example";

    expect(() => getPrimaryAppChainId()).toThrow(/Primary chain 1 is not fully configured/);
    expect(getMissingAppChainEnvVars(1)).toContain("NEXT_PUBLIC_REGISTRY_ADDRESS_1");
  });
});
