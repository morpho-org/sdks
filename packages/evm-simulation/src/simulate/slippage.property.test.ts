import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import {
  ConsumerLimitViolationError,
  type SimulationVerificationContext,
} from "../errors.js";
import { checkSlippage } from "./slippage.js";

const WAD = 10n ** 18n;
const context: SimulationVerificationContext = {
  stage: "verification",
  mode: "final",
  chainId: 1,
  blockNumber: 1n,
  operation: "vaultV2Deposit",
  vault: "0x0000000000000000000000000000000000000001",
};
const expectedAmount = fc.oneof(
  fc.constantFrom(1n, 2n, WAD, (1n << 128n) - 1n),
  fc.bigInt({ min: 1n, max: (1n << 128n) - 1n }),
);
const toleranceWad = fc.oneof(
  fc.constantFrom(0n, 1n, WAD / 100n, WAD),
  fc.bigInt({ min: 0n, max: WAD }),
);

// SDK-side rule implemented by checkSlippage (no onchain counterpart): received assets are lower
// bounds (observed >= expected * (1 - tol), rounded up) and paid assets upper bounds (observed <=
// expected * (1 + tol), rounded down), both inclusive. Minted shares are lower bounds and burned
// shares upper bounds by default; with `debtShares: true` the two share fields swap.
describe("checkSlippage", () => {
  test.prop(
    [
      fc.record({
        side: fc.oneof(
          fc.record({
            field: fc.constant("assetsReceived" as const),
            debtShares: fc.boolean(),
          }),
          fc.constantFrom(
            { field: "sharesMinted" as const, debtShares: false },
            { field: "sharesBurned" as const, debtShares: true },
          ),
        ),
        expected: expectedAmount,
        tolerance: toleranceWad,
      }),
    ],
    { numRuns: 1000 },
  )(
    "behavior: outputs accept exactly down to the rounded-up lower bound",
    ({ side: { field, debtShares }, expected, tolerance }) => {
      const bound = (expected * (WAD - tolerance) + WAD - 1n) / WAD;
      const limits = {
        quote: { [field]: expected },
        slippageTolerance: tolerance,
      };
      expect(bound).toBeLessThanOrEqual(expected);
      expect(
        checkSlippage({
          limits,
          observed: { [field]: bound },
          context,
          debtShares,
        }),
      ).toEqual(limits);
      if (bound > 0n) {
        expect(() =>
          checkSlippage({
            limits,
            observed: { [field]: bound - 1n },
            context,
            debtShares,
          }),
        ).toThrow(ConsumerLimitViolationError);
      }
    },
  );

  test.prop(
    [
      fc.record({
        side: fc.oneof(
          fc.record({
            field: fc.constant("assetsPaid" as const),
            debtShares: fc.boolean(),
          }),
          fc.constantFrom(
            { field: "sharesBurned" as const, debtShares: false },
            { field: "sharesMinted" as const, debtShares: true },
          ),
        ),
        expected: expectedAmount,
        tolerance: toleranceWad,
      }),
    ],
    { numRuns: 1000 },
  )(
    "behavior: inputs accept exactly up to the rounded-down upper bound",
    ({ side: { field, debtShares }, expected, tolerance }) => {
      const bound = (expected * (WAD + tolerance)) / WAD;
      const limits = {
        quote: { [field]: expected },
        slippageTolerance: tolerance,
      };
      expect(bound).toBeGreaterThanOrEqual(expected);
      expect(
        checkSlippage({
          limits,
          observed: { [field]: bound },
          context,
          debtShares,
        }),
      ).toEqual(limits);
      expect(() =>
        checkSlippage({
          limits,
          observed: { [field]: bound + 1n },
          context,
          debtShares,
        }),
      ).toThrow(ConsumerLimitViolationError);
    },
  );
});
