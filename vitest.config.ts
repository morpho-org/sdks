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
        "packages/test/**",
        "packages/morpho-test/**",
      ],
    },
    sequence: {
      concurrent: true,
    },
    globalSetup: "vitest.setup.ts",
    retry: process.env.CI ? 2 : 0,
    testTimeout: 40_000,
    workspace: [
      {
        extends: true,
        test: {
          name: "morpho-ts",
          include: ["packages/morpho-ts/test/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "blue-sdk",
          include: ["packages/blue-sdk/test/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "blue-sdk-viem",
          include: ["packages/blue-sdk-viem/test/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "migration-sdk-viem",
          include: ["packages/migration-sdk-viem/test/**/*.test.ts"],
          testTimeout: 90_000,
        },
      },
      {
        extends: true,
        test: {
          name: "blue-sdk-wagmi-e2e",
          include: ["packages/blue-sdk-wagmi/test/e2e/**/*.test.ts"],
          environment: "happy-dom",
        },
      },
      {
        extends: true,
        test: {
          name: "blue-sdk-wagmi-unit",
          include: ["packages/blue-sdk-wagmi/test/unit/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "simulation-sdk",
          include: ["packages/simulation-sdk/test/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "simulation-sdk-wagmi",
          include: ["packages/simulation-sdk-wagmi/test/**/*.test.ts"],
          environment: "happy-dom",
        },
      },
      {
        extends: true,
        test: {
          name: "bundler-sdk-viem",
          include: ["packages/bundler-sdk-viem/test/**/*.test.ts"],
          environment: "happy-dom",
          testTimeout: 60_000,
        },
      },
      {
        extends: true,
        test: {
          name: "liquidation-sdk-viem",
          include: ["packages/liquidation-sdk-viem/test/**/*.test.ts"],
          testTimeout: 90_000,
        },
      },
      {
        extends: true,
        test: {
          name: "liquidity-sdk-viem",
          include: ["packages/liquidity-sdk-viem/test/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "test",
          include: ["packages/test/test/**/*.test.ts"],
        },
      },
    ],
  },
});
