import { defineConfig } from "vitest/config";

// Queue fork tests before their timeout starts while keeping pure tests unconstrained.
const forkTestConfig = {
  ...(process.env.CI
    ? {
        maxConcurrency: 2,
        maxWorkers: 8,
        sequence: { groupOrder: 1 }, // Separate from unconstrained unit projects.
      }
    : {}),
  testTimeout: 120_000,
} as const;

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
        "packages/morpho-test/**",
        "packages/**/*.md",
        "packages/**/src/**/*.test.ts",
        "packages/**/src/**/__test__/**",
        "packages/**/src/**/__mocks__/**",
        "packages/**/src/**/__fixtures__/**",
        "packages/**/src/**/index.ts",
        "packages/morpho-sdk/src/augment/**",
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
          name: "agents-engine",
          // Deterministic helpers behind the .agents/pr-review-engine review
          // dispatcher. Colocated *.test.ts must be matched here or they
          // silently skip (per AGENTS.md §5). Several of these cases spawn the
          // scripts as `node <script>.ts` (execFileSync) to integration-test the
          // CLI, so they need Node's native type-stripping (>=22.18) just like
          // the live engine — which is why engines.node is pinned to >=22.18.
          include: [".agents/pr-review-engine/scripts/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "morpho-ts",
          include: ["packages/morpho-ts/src/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "blue-sdk",
          include: ["packages/blue-sdk/src/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "blue-sdk-fork",
          include: ["packages/blue-sdk/test/**/*.integration.test.ts"],
          ...forkTestConfig,
        },
      },
      {
        extends: true,
        test: {
          name: "midnight-sdk",
          include: ["packages/midnight-sdk/src/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "midnight-sdk-fork",
          include: ["packages/midnight-sdk/test/**/*.integration.test.ts"],
          ...forkTestConfig,
        },
      },
      {
        extends: true,
        test: {
          name: "morpho-sdk",
          include: [
            "packages/morpho-sdk/src/**/*.test.ts",
            // Unit tests for test-only support modules stay beside those modules.
            "packages/morpho-sdk/test/helpers/**/*.test.ts",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "morpho-sdk-fork",
          include: ["packages/morpho-sdk/test/**/*.integration.test.ts"],
          ...forkTestConfig,
        },
      },
      {
        extends: true,
        test: {
          name: "evm-simulation",
          include: ["packages/evm-simulation/src/**/*.test.ts"],
          globals: true,
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "evm-simulation-fork",
          include: ["packages/evm-simulation/test/**/*.integration.test.ts"],
          globals: true,
          environment: "node",
          ...forkTestConfig,
        },
      },
      {
        extends: true,
        test: {
          name: "blue-sdk-viem",
          include: ["packages/blue-sdk-viem/src/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "blue-sdk-viem-fork",
          include: ["packages/blue-sdk-viem/test/**/*.integration.test.ts"],
          ...forkTestConfig,
        },
      },
      {
        extends: true,
        test: {
          name: "liquidity-sdk-viem",
          include: ["packages/liquidity-sdk-viem/src/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "liquidity-sdk-viem-fork",
          include: [
            "packages/liquidity-sdk-viem/test/**/*.integration.test.ts",
          ],
          ...forkTestConfig,
        },
      },
      {
        extends: true,
        test: {
          name: "test",
          include: ["packages/test/src/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "test-fork",
          include: ["packages/test/test/**/*.integration.test.ts"],
          ...forkTestConfig,
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
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "wdk-protocol-lending-morpho-evm-fork",
          include: [
            "packages/wdk-protocol-lending-morpho-evm/test/**/*.integration.test.ts",
          ],
          ...forkTestConfig,
        },
      },
    ],
  },
});
