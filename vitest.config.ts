import { configDefaults, defineConfig } from "vitest/config";

// Fork-backed files still run across every available worker. CI limits only the tests started
// within each worker so independent Anvil nodes do not collectively saturate the shared upstream
// RPC; local runs retain Vitest's default concurrency of five.
const forkTestMaxConcurrency = process.env.CI ? 2 : 5;

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
          maxConcurrency: forkTestMaxConcurrency,
        },
      },
      {
        extends: true,
        test: {
          name: "midnight-sdk",
          include: [
            "packages/midnight-sdk/src/**/*.test.ts",
            "packages/midnight-sdk/test/**/*.test.ts",
          ],
          maxConcurrency: forkTestMaxConcurrency,
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
          // Mainnet-fork tests provision an Anvil fork per test; under CI load
          // fork setup + RPC latency can push a test past 60s and flake. Give
          // headroom to match the heaviest fork projects.
          testTimeout: 120_000,
          maxConcurrency: forkTestMaxConcurrency,
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
          // Fork specs require MAINNET_RPC_URL (parsed at module load via
          // test/setup.ts) and a live RPC. Keep them out of the default unit
          // project so `pnpm --filter @morpho-org/evm-simulation test` runs
          // offline; they run in the opt-in `evm-simulation-fork` project.
          exclude: [
            ...configDefaults.exclude,
            "packages/evm-simulation/src/**/*.fork.spec.ts",
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
          name: "evm-simulation-fork",
          include: ["packages/evm-simulation/src/**/*.fork.spec.ts"],
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
          // Mainnet-fork tests provision an Anvil fork per test; under CI load
          // fork setup + RPC latency can push a test past 60s and flake. Give
          // headroom to match the heaviest fork projects.
          testTimeout: 120_000,
          maxConcurrency: forkTestMaxConcurrency,
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
          maxConcurrency: forkTestMaxConcurrency,
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
          maxConcurrency: forkTestMaxConcurrency,
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
