import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (p: string) => fileURLToPath(new URL(`./src/${p}`, import.meta.url));

export default defineConfig({
  resolve: {
    // Mirrors the "paths" in tsconfig.json
    alias: {
      "@/lib": src("lib"),
      "@/hooks": src("hooks"),
      "@/components": src("components"),
      "@/types": src("types"),
      "@/utils": src("utils"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
