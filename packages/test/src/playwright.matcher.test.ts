import { describe, expect, test } from "vitest";
import { expect as playwrightExpect } from "./playwright.js";

describe("toApproxEqual", () => {
  test("rejects a one-wei difference at a large magnitude", () => {
    const amount = 10n ** 40n;
    expect(() =>
      playwrightExpect(amount + 1n).toApproxEqual(amount, 18),
    ).toThrow();
    playwrightExpect(amount + 1n).not.toApproxEqual(amount, 18);
  });

  test.each([0n, 10n ** 40n, -(10n ** 40n)])(
    "keeps the strict decimal tolerance around %s",
    (amount) => {
      const boundary = 5n * 10n ** 15n;
      playwrightExpect(amount).toApproxEqual(amount);
      for (const sign of [-1n, 1n]) {
        playwrightExpect(amount + sign * (boundary - 1n)).toApproxEqual(amount);
        expect(() =>
          playwrightExpect(amount + sign * boundary).toApproxEqual(amount),
        ).toThrow();
        playwrightExpect(amount + sign * boundary).not.toApproxEqual(amount);
        playwrightExpect(amount + sign * (boundary + 1n)).not.toApproxEqual(
          amount,
        );
      }
      expect(() =>
        playwrightExpect(amount).not.toApproxEqual(amount),
      ).toThrow();
    },
  );

  test("supports custom decimals and negative precision", () => {
    playwrightExpect(4999n).toApproxEqual(0n, 2, 6);
    playwrightExpect(5000n).not.toApproxEqual(0n, 2, 6);
    playwrightExpect(4n).toApproxEqual(0n, -1, 0);
    playwrightExpect(5n).not.toApproxEqual(0n, -1, 0);
  });

  test("preserves fractional and non-finite precision behavior", () => {
    playwrightExpect(15n).toApproxEqual(0n, 0.5, 2);
    playwrightExpect(16n).not.toApproxEqual(0n, 0.5, 2);
    playwrightExpect(1n).toApproxEqual(0n, -Infinity);
    playwrightExpect(0n).not.toApproxEqual(0n, Infinity);
    playwrightExpect(0n).not.toApproxEqual(0n, NaN);
  });
});
