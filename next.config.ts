import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/card", destination: "/bundles", permanent: true },
      { source: "/slates", destination: "/bundles", permanent: true },
      { source: "/slates/:slug", destination: "/bundles/:slug", permanent: true },
    ];
  },
};

export default nextConfig;
