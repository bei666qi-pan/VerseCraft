import type { NextConfig } from "next";

/**
 * Next.js loads env files in this order (later overrides earlier): `.env` → `.env.local` → `.env.[mode].local`.
 * Local: put secrets in `.env.local` (gitignored). Coolify: set the same variable names in the UI (runtime injection).
 * Application code must use `@/lib/config/envRaw` / `serverConfig` — not raw `process.env` in `src/`.
 */
const envDevOrigins =
  process.env.NEXT_DEV_ALLOWED_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? [];

const nextConfig: NextConfig = {
  output: "standalone",
  // Live AI evaluations may run beside the developer's :666 server. Give the
  // dedicated SUT its own build/lock directory when the runner requests one.
  distDir: process.env.VERSECRAFT_NEXT_DIST_DIR?.trim() || ".next",
  transpilePackages: ["lucide-react", "idb-keyval", "zustand"],
  devIndicators: false,
  // Dev-only: allow requests when the browser host differs from the server's
  // canonical host (e.g. http://127.0.0.1:666 vs http://localhost:666, or VPN/LAN hosts).
  allowedDevOrigins: ["localhost", "127.0.0.1", ...envDevOrigins],
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.versecraft.cn" }],
        destination: "https://versecraft.cn/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/audio/bgm/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/assets/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
  typescript: {
    tsconfigPath: process.env.VERSECRAFT_NEXT_TSCONFIG_PATH?.trim() || "tsconfig.json",
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
