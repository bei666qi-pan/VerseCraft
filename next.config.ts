import type { NextConfig } from "next";

const envDevOrigins =
  process.env.NEXT_DEV_ALLOWED_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? [];

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["lucide-react", "idb-keyval", "zustand"],
  devIndicators: false,
  // Dev-only: allow requests when the browser host differs from the server's
  // canonical host (e.g. http://127.0.0.1:666 vs http://localhost:666, or VPN/LAN hosts).
  allowedDevOrigins: ["localhost", "127.0.0.1", ...envDevOrigins],
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
