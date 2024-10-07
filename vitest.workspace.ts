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
      // E2E tests not yet working
      exclude: ["packages/blue-sdk-viem-simulation/test/e2e/**"],
      environmentMatchGlobs: [["**/e2e/**/*.test.ts", "happy-dom"]],
    },
  },
]);
