import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { mainnet, sepolia } from "wagmi/chains";
import { anvil } from "./chains";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

export const wagmiConfig = getDefaultConfig({
  appName: "NFTFactory",
  projectId,
  chains: [mainnet, sepolia, anvil],
  ssr: true
});
