import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root (a parent package-lock.json otherwise confuses inference).
  turbopack: {
    root: process.cwd(),
  },
  // Allow the local browser-preview proxy (127.0.0.1) to load dev assets.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  serverExternalPackages: [
    "@mastra/core",
    "@browserbasehq/sdk",
    "redis",
    "playwright-core",
  ],
};

export default nextConfig;
