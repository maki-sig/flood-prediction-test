import type { NextConfig } from "next";

// Use a loose object and assert to NextConfig to allow adding dev-only watcher options
const _cfg = {
  // Reduce dev file-watcher work on Windows/OneDrive by ignoring heavy folders
  // Note: Turbopack is the default in Next.js 16+. We add an explicit empty
  // turbopack config to avoid the "webpack config present" error. The
  // `webpack` hook below will only be used when running with the `--webpack`
  // flag or with older Next.js versions.
  turbopack: {},
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
