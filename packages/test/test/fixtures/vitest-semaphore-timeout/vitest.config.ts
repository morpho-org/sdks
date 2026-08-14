import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["*.fixture.ts"],
    environment: "node",
    fileParallelism: true,
    maxWorkers: 2,
    pool: "forks",
    sequence: {
      concurrent: true,
    },
    testTimeout: 15_000,
  },
});
