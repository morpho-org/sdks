import { MathLib } from "@morpho-org/blue-sdk";
import fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
  NegativeInputError,
  ReferralFeePctExceededError,
} from "../types/index.js";
import { grossFromNetAssets } from "./referralFee.js";

describe("grossFromNetAssets", () => {
  test("default", () => {
    expect(
      grossFromNetAssets({
        netAssets: 90n,
        referralFeePct: MathLib.WAD / 10n,
      }),
    ).toBe(100n);
  });

  test("behavior: exactly round-trips the contract floor-fee rule", () => {
    fc.assert(
      fc.property(
        fc.record({
          netAssets: fc.bigInt({ min: 0n, max: (1n << 128n) - 1n }),
          referralFeePct: fc.bigInt({ min: 0n, max: MathLib.WAD - 1n }),
        }),
        ({ netAssets, referralFeePct }) => {
          const gross = grossFromNetAssets({ netAssets, referralFeePct });
          const fee = MathLib.mulDivDown(gross, referralFeePct, MathLib.WAD);
          expect(gross - fee).toBe(netAssets);
        },
      ),
      { numRuns: 200, seed: 20_260_908 },
    );
  });

  test("error: typed boundaries", () => {
    expect(() =>
      grossFromNetAssets({ netAssets: -1n, referralFeePct: 0n }),
    ).toThrow(NegativeInputError);
    expect(() =>
      grossFromNetAssets({ netAssets: 1n, referralFeePct: -1n }),
    ).toThrow(NegativeInputError);
    expect(() =>
      grossFromNetAssets({ netAssets: 1n, referralFeePct: MathLib.WAD }),
    ).toThrow(ReferralFeePctExceededError);
  });
});
