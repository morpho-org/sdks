import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      reporter: process.env.CI ? ["lcov"] : ["text", "json", "html"],
      exclude: [
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
    globalSetup: "vitest.setup.ts",
    testTimeout: 90_000,
  },
});
