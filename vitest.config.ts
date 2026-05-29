import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      reporter: ["text-summary", "lcov"],
      include: [
        "packages/**/src/**/*.{ts,tsx}",
        "scripts/release/**/*.{js,mjs}",
      ],
      exclude: [
        "packages/test/**",
        "packages/test-wagmi/**",
        "packages/morpho-test/**",
        "packages/**/*.md",
        "packages/**/src/**/*.test.ts",
        "packages/**/src/**/__test__/**",
        "packages/**/src/**/__mocks__/**",
        "packages/**/src/**/__fixtures__/**",
        "packages/**/src/**/index.ts",
        "packages/**/src/**/*.d.ts",
        "packages/**/src/**/abis.ts",
        "packages/**/src/api/sdk.ts",
        "packages/**/src/api/types.ts",
        "scripts/**/*.test.{js,mjs}",
      ],
    },
    sequence: {
      concurrent: true,
    },
    globalSetup: "vitest.setup.ts",
    retry: process.env.CI ? 2 : 0,
    testTimeout: 30_000,
    projects: [
      {
        extends: true,
        test: {
          name: "scripts",
          include: ["scripts/**/*.test.{js,mjs}"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "morpho-ts",
          include: [
            "packages/morpho-ts/test/**/*.test.ts",
            "packages/morpho-ts/src/**/*.test.ts",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "blue-sdk",
          include: [
            "packages/blue-sdk/test/**/*.test.ts",
            "packages/blue-sdk/src/**/*.test.ts",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "morpho-sdk",
          include: [
            "packages/morpho-sdk/src/**/*.test.ts",
            "packages/morpho-sdk/test/**/*.test.ts",
          ],
          testTimeout: 60_000,
        },
      },
      {
        extends: true,
        test: {
          name: "evm-simulation",
          include: [
            "packages/evm-simulation/src/**/*.spec.ts",
            "packages/evm-simulation/src/**/*.test.ts",
          ],
          globals: true,
          environment: "node",
          sequence: {
            concurrent: false,
          },
        },
      },
      {
        extends: true,
        test: {
          name: "blue-sdk-viem",
          include: [
            "packages/blue-sdk-viem/test/**/*.test.ts",
            "packages/blue-sdk-viem/src/**/*.test.ts",
          ],
          testTimeout: 60_000,
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
          include: [
            "packages/bundler-sdk-viem/test/**/*.test.ts",
            "packages/bundler-sdk-viem/src/**/*.test.ts",
          ],
          environment: "happy-dom",
          testTimeout: 60_000,
        },
      },
      {
        extends: true,
        test: {
          name: "liquidation-sdk-viem",
          include: [
            "packages/liquidation-sdk-viem/test/**/*.test.ts",
            "packages/liquidation-sdk-viem/src/**/*.test.ts",
          ],
          testTimeout: 90_000,
        },
      },
      {
        extends: true,
        test: {
          name: "liquidity-sdk-viem",
          include: [
            "packages/liquidity-sdk-viem/test/**/*.test.ts",
            "packages/liquidity-sdk-viem/src/**/*.test.ts",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "test",
          include: [
            "packages/test/test/**/*.test.ts",
            "packages/test/src/**/*.test.ts",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "morpho-test",
          include: ["packages/morpho-test/src/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "wdk-protocol-lending-morpho-evm",
          include: [
            "packages/wdk-protocol-lending-morpho-evm/src/**/*.test.ts",
            "packages/wdk-protocol-lending-morpho-evm/tests/**/*.test.ts",
          ],
          testTimeout: 120_000,
        },
      },
    ],
  },
});
