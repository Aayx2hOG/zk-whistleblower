"use client";

import { WagmiProvider, type Config as WagmiConfig } from "wagmi";
import { hardhat, sepolia } from "wagmi/chains";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState, useEffect } from "react";

const networkName = process.env.NEXT_PUBLIC_NETWORK_NAME?.toLowerCase();
const activeChains =
  networkName === "sepolia" ? ([sepolia] as const) : ([hardhat] as const);

// ssr: false — this app never reads dehydrated wallet state from the server.
// Keeping ssr: true without passing initialState to WagmiProvider caused
// "useConfig must be used within WagmiProvider" on every page with wagmi hooks.
const wagmiConfig = getDefaultConfig({
  appName: "ZK Whistleblower",
  projectId:
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "placeholder_dev_id",
  chains: activeChains,
  ssr: false,
});

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  // Mount guard: prevents wagmi hooks from executing during SSR / before
  // hydration, which would throw WagmiProviderNotFoundError.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig as WagmiConfig}>
        {mounted ? children : null}
      </WagmiProvider>
    </QueryClientProvider>
  );
}
