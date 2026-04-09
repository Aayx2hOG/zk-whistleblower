import type { NextConfig } from "next";
import { existsSync, readFileSync } from "fs";
import path from "path";

const bundledPublicKeyPath = path.join(__dirname, ".keys", "report-public.spki.b64");
const bundledPublicKey = existsSync(bundledPublicKeyPath)
  ? readFileSync(bundledPublicKeyPath, "utf8").trim()
  : "";
const resolvedPublicKey =
  process.env.NEXT_PUBLIC_REPORT_RSA_PUBLIC_KEY_B64?.trim() || bundledPublicKey;

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, "../.."),
  env: resolvedPublicKey
    ? {
        NEXT_PUBLIC_REPORT_RSA_PUBLIC_KEY_B64: resolvedPublicKey,
      }
    : undefined,
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
