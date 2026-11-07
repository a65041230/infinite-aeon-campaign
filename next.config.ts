import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Doubt-Driven 鑑別工作台 is a static page served from public/ddx.
  async rewrites() {
    return [{ source: "/ddx", destination: "/ddx/index.html" }];
  },
};

export default nextConfig;
