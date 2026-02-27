import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { mainnet, sepolia } from "wagmi/chains";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

export const wagmiConfig = getDefaultConfig({
  appName: "NFTFactory",
  projectId,
  chains: [mainnet, sepolia],
  ssr: true
});
