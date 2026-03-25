"use client";

import {
  getDefaultConfig,
} from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { hardhat, sepolia } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState } from "react";

const networkName = process.env.NEXT_PUBLIC_NETWORK_NAME?.toLowerCase();
const activeChains = networkName === "sepolia" ? ([sepolia] as const) : ([hardhat] as const);

const config = getDefaultConfig({
  appName: "ZK Whistleblower",
  projectId:
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "placeholder_dev_id",
  chains: activeChains,
  ssr: true,
});

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={config as any}>
        {children}
      </WagmiProvider>
    </QueryClientProvider>
  );
}
