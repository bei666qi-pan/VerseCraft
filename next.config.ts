import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["lucide-react", "idb-keyval", "zustand"],
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
