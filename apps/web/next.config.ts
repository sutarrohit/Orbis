import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  turbopack: {
    // Pin the Turbopack root to the monorepo root. Turbopack reports module
    // paths relative to this root (e.g. "apps/web/app/error.tsx"), and pnpm's
    // virtual store (node_modules/.pnpm, where "next" really lives) sits here
    // too. Leaving it unset let the dev server's project filesystem drift to
    // apps/web, so monorepo-relative paths "needed to be on project filesystem
    // apps/web" and HMR panicked. "../.." = apps/web -> apps -> repo root.
    root: path.join(__dirname, "..", ".."),
  },
};

export default nextConfig;
