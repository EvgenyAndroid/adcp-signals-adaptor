// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/types/**", "src/index.ts"],
    },
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  // Treat seed files as plain text for import
  assetsInclude: ["**/*.tsv", "**/*.csv"],
});
