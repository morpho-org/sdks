import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    test: {
      name: "morpho-ts",
      include: ["packages/morpho-ts/**/*.test.ts"],
    },
  },
  {
    test: {
      name: "blue-sdk",
      include: ["packages/blue-sdk/**/*.test.ts"],
    },
  },
  {
    test: {
      name: "blue-sdk-viem",
      include: ["packages/blue-sdk-viem/**/*.test.ts"],
      testTimeout: 30_000,
    },
  },
  {
    test: {
      name: "blue-sdk-wagmi",
      include: ["packages/blue-sdk-wagmi/**/*.test.ts"],
      environmentMatchGlobs: [["**/e2e/**/*.test.ts", "happy-dom"]],
    },
  },
  {
    test: {
      name: "blue-sdk-viem-simulation",
      include: ["packages/blue-sdk-viem-simulation/**/*.test.ts"],
      environmentMatchGlobs: [["**/e2e/**/*.test.ts", "happy-dom"]],
      testTimeout: 30_000,
    },
  },
]);
