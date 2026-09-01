import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app is its own workspace; pin the root so the sibling engine
  // lockfile / a stray ~/package-lock.json can't be picked up.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
