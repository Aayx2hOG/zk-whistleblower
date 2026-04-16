"use client";

import { WagmiProvider, type Config as WagmiConfig } from "wagmi";
import { hardhat, sepolia } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useEffect, useState } from "react";

const networkName = process.env.NEXT_PUBLIC_NETWORK_NAME?.toLowerCase();
const activeChains =
  networkName === "sepolia" ? ([sepolia] as const) : ([hardhat] as const);

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [wagmiConfig, setWagmiConfig] = useState<WagmiConfig | null>(null);

  // Create the wagmi/rainbowkit config on the client only.
  // This avoids SSR crashes from WalletConnect attempting to access `indexedDB`.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const { getDefaultConfig } = await import("@rainbow-me/rainbowkit");
      const cfg = getDefaultConfig({
        appName: "ZK Whistleblower",
        projectId:
          process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "placeholder_dev_id",
        chains: activeChains,
        ssr: false,
      }) as WagmiConfig;

      if (!cancelled) setWagmiConfig(cfg);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Mount guard: prevents wagmi hooks from executing during SSR / before hydration.
  if (!wagmiConfig) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>
    </QueryClientProvider>
  );
}
