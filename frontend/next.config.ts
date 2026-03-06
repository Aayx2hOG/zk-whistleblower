import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // snarkjs / circomlibjs use Node.js built-ins that don't exist in the browser
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
