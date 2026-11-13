import type { NextConfig } from "next";
import path from "node:path";

// Use a loose object and assert to NextConfig to allow adding dev-only watcher options
const _cfg = {
  // Reduce dev file-watcher work on Windows/OneDrive by ignoring heavy folders
  // Explicitly set Turbopack root to the frontend project directory to silence multiple lockfiles warning
  turbopack: {
    root: path.resolve(__dirname),
  },
  webpack: (config: any, { dev }: { dev: boolean }) => {
    if (dev) {
      config.watchOptions = {
        ignored: ["**/.git/**", "**/node_modules/**", "**/.next/**", "**/data/**"],
      } as any;
    }
    return config;
  },
};

const nextConfig = _cfg as unknown as NextConfig;

export default nextConfig;
