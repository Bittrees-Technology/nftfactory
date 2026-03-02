import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "viem";
import { mainnet, sepolia } from "wagmi/chains";
import { anvil } from "./chains";

const DEFAULT_WALLETCONNECT_PROJECT_ID = "e63eaf5138df1d6c053f2b91cfb0ee5c";
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || DEFAULT_WALLETCONNECT_PROJECT_ID;
const configuredChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || "11155111");
const configuredRpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "";

export const wagmiConfig = getDefaultConfig({
  appName: "NFTFactory",
  projectId,
  chains: [mainnet, sepolia, anvil],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: configuredChainId === sepolia.id && configuredRpcUrl ? http(configuredRpcUrl) : http(),
    [anvil.id]:
      configuredChainId === anvil.id && configuredRpcUrl ? http(configuredRpcUrl) : http("http://127.0.0.1:8545")
  },
  ssr: true
});
