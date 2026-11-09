import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Doubt-Driven 鑑別工作台 is a static page served from public/ddx.
  async rewrites() {
    return [{ source: "/ddx", destination: "/ddx/index.html" }];
  },
  // On the DDx-only Vercel project (DDX_ROOT_REDIRECT=1) the bare address opens
  // the tool. The campaign site built from the same code does not set it.
  async redirects() {
    return process.env.DDX_ROOT_REDIRECT === "1" ? [{ source: "/", destination: "/ddx", permanent: false }] : [];
  },
};

export default nextConfig;
