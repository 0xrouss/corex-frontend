import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next 16 defaults to Turbopack; empty config acknowledges custom webpack below (Reown AppKit).
  turbopack: {},
  webpack: (config) => {
    if (Array.isArray(config.externals)) {
      config.externals.push("pino-pretty", "lokijs", "encoding");
    }
    return config;
  },
};

export default nextConfig;
