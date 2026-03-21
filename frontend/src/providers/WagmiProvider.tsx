"use client";

import {
  getDefaultConfig,
} from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { hardhat } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState } from "react";

// Hardhat local network — used for development as-is.
const config = getDefaultConfig({
  appName: "ZK Whistleblower",
  projectId:
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "placeholder_dev_id",
  chains: [hardhat],
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
