"use client";

import { WagmiProvider, type Config as WagmiConfig } from "wagmi";
import { hardhat, sepolia } from "wagmi/chains";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState } from "react";

// Build wagmi config once at module level — NOT in an effect.
// This avoids re-creating the config on every navigation/re-render.
const networkName = process.env.NEXT_PUBLIC_NETWORK_NAME?.toLowerCase();
const activeChains =
  networkName === "sepolia" ? ([sepolia] as const) : ([hardhat] as const);

const wagmiConfig = getDefaultConfig({
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
      <WagmiProvider config={wagmiConfig as WagmiConfig}>
        {children}
      </WagmiProvider>
    </QueryClientProvider>
  );
}
