import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { mainnet, sepolia } from "wagmi/chains";
import { anvil } from "./chains";

const DEFAULT_WALLETCONNECT_PROJECT_ID = "e63eaf5138df1d6c053f2b91cfb0ee5c";
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || DEFAULT_WALLETCONNECT_PROJECT_ID;

export const wagmiConfig = getDefaultConfig({
  appName: "NFTFactory",
  projectId,
  chains: [mainnet, sepolia, anvil],
  ssr: true
});
