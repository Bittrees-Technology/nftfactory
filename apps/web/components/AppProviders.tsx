"use client";

import { ReactNode, useState } from "react";
import "@rainbow-me/rainbowkit/styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { createWagmiConfig } from "../lib/wagmi";

export default function AppProviders({
  children,
  walletConnectProjectId
}: {
  children: ReactNode;
  walletConnectProjectId?: string;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const [wagmiConfig] = useState(() => createWagmiConfig(walletConnectProjectId));

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>{children}</RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
