import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["packages/*-ethers*/**"],
    coverage: {
      reporter: process.env.CI ? ["lcov"] : ["text", "json", "html"],
      exclude: [
        ".yarn",
        ".pnp.*",
        "**/lib/**",
        "**/dist/**",
        "**/artifacts/**",
        "**/test/**",
        "**/*.test-d.ts",
        "packages/morpho-test/**",
      ],
    },
    sequence: {
      concurrent: true,
    },
    testTimeout: 30_000,
  },
});
