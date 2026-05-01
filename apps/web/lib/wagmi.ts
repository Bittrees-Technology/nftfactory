import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { fallback, http, type Chain, type Transport } from "viem";
import { getEnabledAppChains, getPrimaryAppChainId } from "./chains";
import { getContractsConfig } from "./contracts";
import {
  hasConfiguredWalletConnectProjectId,
  isUsingDefaultWalletConnectProjectId,
  resolveWalletConnectProjectId
} from "./walletConnect";

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
    let rpcUrls = chain.rpcUrls.default.http.filter(Boolean);
    try {
      rpcUrls = getContractsConfig(chain.id).rpcUrls;
    } catch {
      rpcUrls = chain.rpcUrls.default.http.filter(Boolean);
    }
    if (rpcUrls.length === 0) {
      return [chain.id, http()];
    }

    if (rpcUrls.length === 1) {
      return [chain.id, http(rpcUrls[0])];
    }

    return [chain.id, fallback(rpcUrls.map((rpcUrl) => http(rpcUrl)), { rank: false })];
  })
) as Record<number, Transport>;

export const wagmiConfig = getDefaultConfig({
  appName: "NFTFactory",
  appDescription: "Mint, publish, and manage NFTs on nftfactory.eth",
  appUrl: "https://nftfactory.org",
  projectId: resolveWalletConnectProjectId(),
  chains: chains as [Chain, ...Chain[]],
  transports,
  ssr: true
});

export { hasConfiguredWalletConnectProjectId, isUsingDefaultWalletConnectProjectId };

export function createWagmiConfig(projectId = resolveWalletConnectProjectId()) {
  return getDefaultConfig({
    appName: "NFTFactory",
    appDescription: "Mint, publish, and manage NFTs on nftfactory.eth",
    appUrl: "https://nftfactory.org",
    projectId,
    chains: chains as [Chain, ...Chain[]],
    transports,
    ssr: true
  });
}
