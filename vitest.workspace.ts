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
      environment: "happy-dom",
    },
  },
]);
