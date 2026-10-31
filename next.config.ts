import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  pageExtensions: ["ts", "tsx", "js", "jsx"],
  serverExternalPackages: ["node-html-parser", "undici"],
  // The brand-voice file (BRAND_VOICE_FILE) is read at runtime, so bundle the
  // brand/ folder into the route's serverless function on Vercel.
  outputFileTracingIncludes: {
    "/api/generate-meta": ["./brand/**/*"],
  },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type" },
        ],
      },
    ];
  },
};

export default nextConfig;
