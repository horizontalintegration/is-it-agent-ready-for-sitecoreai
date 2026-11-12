import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  pageExtensions: ["ts", "tsx", "js", "jsx"],
  serverExternalPackages: ["node-html-parser", "undici"],
  // The brand-voice file (BRAND_VOICE_FILE) is read at runtime, so bundle the
  // brand/ folder into the route's serverless function on Vercel.
  outputFileTracingIncludes: {
    "/api/generate-meta": ["./brand/**/*"],
  },
  // No CORS headers on /api: only the app's own pages call the routes, and
  // each route refuses other origins (src/lib/server/same-origin.ts).
};

export default nextConfig;
