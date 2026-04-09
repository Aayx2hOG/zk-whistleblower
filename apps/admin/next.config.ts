import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, "../.."),
  experimental: {
    optimizePackageImports: [
      "@zk-whistleblower/shared",
      "@rainbow-me/rainbowkit",
      "wagmi",
      "viem",
    ],
  },
  turbopack: {
    resolveAlias: {
      "@react-native-async-storage/async-storage": "",
    },
  },
  transpilePackages: ["@zk-whistleblower/shared", "@zk-whistleblower/ui"],
  // Webpack fallback — only used when running `next build` (production) or without --turbopack
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@react-native-async-storage/async-storage": false,
    };

    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      os: false,
      crypto: false,
      stream: false,
      readline: false,
    };
    return config;
  },
};

export default nextConfig;
