import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["holder.fixture.ts"],
    maxWorkers: 1,
    pool: "forks",
    testTimeout: 60_000,
  },
});
