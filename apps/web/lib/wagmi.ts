import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http, type Chain } from "viem";
import { getEnabledAppChains, getPrimaryAppChainId } from "./chains";
import { getContractsConfig } from "./contracts";

const DEFAULT_WALLETCONNECT_PROJECT_ID = "e63eaf5138df1d6c053f2b91cfb0ee5c";
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || DEFAULT_WALLETCONNECT_PROJECT_ID;

const chains = getEnabledAppChains();

if (chains.length === 0) {
  const primaryChainId = getPrimaryAppChainId();
  throw new Error(
    `No enabled app chains were resolved for the web app. ` +
      `Check NEXT_PUBLIC_CHAIN_ID or NEXT_PUBLIC_ENABLED_CHAIN_IDS, and make sure the required ` +
      `NEXT_PUBLIC_RPC_URL / NEXT_PUBLIC_REGISTRY_ADDRESS / NEXT_PUBLIC_MARKETPLACE_ADDRESS / ` +
      `NEXT_PUBLIC_SHARED_721_ADDRESS / NEXT_PUBLIC_SHARED_1155_ADDRESS / ` +
      `NEXT_PUBLIC_SUBNAME_REGISTRAR_ADDRESS / NEXT_PUBLIC_FACTORY_ADDRESS env vars are configured ` +
      `for chain ${primaryChainId}.`
  );
}

const transports = Object.fromEntries(
  chains.map((chain) => {
    let rpcUrl = chain.rpcUrls.default.http[0] || "";
    try {
      rpcUrl = getContractsConfig(chain.id).rpcUrl;
    } catch {
      rpcUrl = chain.rpcUrls.default.http[0] || "";
    }
    return [chain.id, rpcUrl ? http(rpcUrl) : http()];
  })
) as Record<number, ReturnType<typeof http>>;

export const wagmiConfig = getDefaultConfig({
  appName: "NFTFactory",
  projectId,
  chains: chains as [Chain, ...Chain[]],
  transports,
  ssr: true
});
