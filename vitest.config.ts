import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      ...configDefaults.exclude,
      "**/lib/**",
      "**/e2e/**",
      "packages/blue-sdk-viem/**",
      "packages/blue-sdk-ethers-liquidation/**",
    ],
  },
});
