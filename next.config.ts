import type { NextConfig } from "next";

// Export statique : le dossier `out/` se déploie tel quel sur Cloudflare Pages.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
