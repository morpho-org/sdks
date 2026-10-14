import { test, fc as vitestFc } from "@fast-check/vitest";
import fc from "fast-check";
import { afterAll, describe, expect } from "vitest";

describe("fast-check setup", () => {
  let runs = 0;

  test("default", () => {
    // Mirrors vitest.fast-check.setup.ts; only setupFiles can satisfy this test.
    const window = Math.floor(Date.now() / (2 * 24 * 60 * 60 * 1000));
    for (const config of [
      fc.readConfigureGlobal(),
      vitestFc.readConfigureGlobal(),
    ]) {
      expect(config.numRuns).toBe(200);
      expect([window, window - 1]).toContain(config.seed);
    }
  });

  test.prop([vitestFc.integer()])(
    "behavior: uses the configured run count",
    () => {
      runs += 1;
    },
  );

  afterAll(() => {
    // The property was filtered out otherwise.
    if (runs > 0) {
      expect(runs).toBe(200);
    }
  });
});
