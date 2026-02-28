import { defineChain } from "viem";
import { mainnet, sepolia } from "viem/chains";

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

export function getAppChain(chainId: number) {
  if (chainId === mainnet.id) return mainnet;
  if (chainId === sepolia.id) return sepolia;
  if (chainId === anvil.id) return anvil;
  return defineChain({
    id: chainId,
    name: `Chain ${chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } }
  });
}

export function getExplorerBaseUrl(chainId: number): string | null {
  if (chainId === mainnet.id) return "https://etherscan.io";
  if (chainId === sepolia.id) return "https://sepolia.etherscan.io";
  return null;
}

