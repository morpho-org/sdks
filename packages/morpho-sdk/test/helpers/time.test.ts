import { describe, expect, test } from "vitest";
import { withChainTimestamp } from "./time.js";

describe("withChainTimestamp", () => {
  test("pins Date.now only until an async callback yields", async () => {
    const originalDateNow = Date.now;
    const timestamp = 1n;
    const result = withChainTimestamp(timestamp, async () => {
      const beforeYield = Date.now();
      await Promise.resolve();
      return { beforeYield, afterYield: Date.now() };
    });

    expect(Date.now).toBe(originalDateNow);
    const { beforeYield, afterYield } = await result;
    expect(beforeYield).toBe(1_000);
    expect(afterYield).not.toBe(1_000);
  });

  test("restores Date.now when the callback throws", () => {
    const originalDateNow = Date.now;

    expect(() =>
      withChainTimestamp(1n, () => {
        throw new Error("expected test error");
      }),
    ).toThrow("expected test error");
    expect(Date.now).toBe(originalDateNow);
  });
});
