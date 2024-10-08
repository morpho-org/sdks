import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      reporter: process.env.CI ? ["lcov"] : ["text", "json", "html"],
      exclude: [
        ".yarn",
        ".pnp.*",
        "vitest.*.ts",
        "**/lib/**",
        "**/dist/**",
        "**/artifacts/**",
        "**/test/**",
        "packages/test/**",
        "packages/morpho-test/**",
        "packages/blue-sdk-ethers*/**",
      ],
    },
    sequence: {
      concurrent: true,
    },
    testTimeout: 30_000,
  },
});
