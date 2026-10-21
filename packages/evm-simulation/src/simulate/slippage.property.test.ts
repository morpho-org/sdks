import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import { ConsumerLimitViolationError } from "../errors.js";
import { checkSlippage } from "./slippage.js";

const WAD = 10n ** 18n;
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
          // Collateral fields ignore `debtShares` on combined ops: production
          // checks them with `debtShares: true`, and the flag must leave them alone.
          fc.record({
            field: fc.constant("collateralSupplied" as const),
            debtShares: fc.boolean(),
          }),
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
        type: "blueSupply" as const,
        quote: { [field]: expected },
        slippageTolerance: tolerance,
      };
      expect(bound).toBeLessThanOrEqual(expected);
      expect(
        checkSlippage({
          label: "Limit operation 0 (vaultV2Deposit)",
          limits,
          observed: { [field]: bound },
          debtShares,
        }),
      ).toEqual({
        quote: limits.quote,
        slippageTolerance: limits.slippageTolerance,
      });
      if (bound > 0n) {
        expect(() =>
          checkSlippage({
            label: "Limit operation 0 (vaultV2Deposit)",
            limits,
            observed: { [field]: bound - 1n },
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
          fc.record({
            field: fc.constant("collateralWithdrawn" as const),
            debtShares: fc.boolean(),
          }),
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
        type: "blueSupply" as const,
        quote: { [field]: expected },
        slippageTolerance: tolerance,
      };
      expect(bound).toBeGreaterThanOrEqual(expected);
      expect(
        checkSlippage({
          label: "Limit operation 0 (vaultV2Deposit)",
          limits,
          observed: { [field]: bound },
          debtShares,
        }),
      ).toEqual({
        quote: limits.quote,
        slippageTolerance: limits.slippageTolerance,
      });
      expect(() =>
        checkSlippage({
          label: "Limit operation 0 (vaultV2Deposit)",
          limits,
          observed: { [field]: bound + 1n },
          debtShares,
        }),
      ).toThrow(ConsumerLimitViolationError);
    },
  );

  const RAY = 10n ** 27n;
  const shareCount = fc.bigInt({ min: 1n, max: (1n << 128n) - 1n });
  const rayPrice = fc.bigInt({ min: 1n, max: (1n << 128n) - 1n });

  // A sharePrice bound prices assets-per-share with the same rounding
  // discipline as amount bounds: the paid-assets cap rounds the bound down
  // while the realized rate rounds up, and the received-assets floor rounds
  // the bound up while the realized rate rounds down. Amount quotes mirror
  // the observation at 100% tolerance so only the rate check can reject.
  test.prop(
    [
      fc.record({
        shares: shareCount,
        expected: rayPrice,
        tolerance: toleranceWad,
      }),
    ],
    { numRuns: 1000 },
  )(
    "behavior: sharePrice accepts paid assets exactly up to the rounded bound",
    ({ shares, expected, tolerance }) => {
      const bound = (expected * (WAD + tolerance)) / WAD; // wMulDown
      fc.pre((bound * shares) % RAY !== 0n);
      const maxAssets = (bound * shares) / RAY;
      const limits = (assetsPaid: bigint) => ({
        type: "vaultV2Deposit" as const,
        quote: { assetsPaid, sharesMinted: shares },
        slippageTolerance: WAD,
        sharePrice: { expected, tolerance },
      });
      const observed = (assetsPaid: bigint) => ({
        assetsPaid,
        sharesMinted: shares,
      });
      expect(
        checkSlippage({
          label: "Limit operation 0 (vaultV2Deposit)",
          limits: limits(maxAssets),
          observed: observed(maxAssets),
        }),
      ).toEqual({
        quote: { assetsPaid: maxAssets, sharesMinted: shares },
        slippageTolerance: WAD,
        sharePrice: { expected, tolerance },
      });
      expect(() =>
        checkSlippage({
          label: "Limit operation 0 (vaultV2Deposit)",
          limits: limits(maxAssets + 1n),
          observed: observed(maxAssets + 1n),
        }),
      ).toThrow(ConsumerLimitViolationError);
    },
  );

  test.prop(
    [
      fc.record({
        shares: shareCount,
        expected: rayPrice,
        tolerance: toleranceWad,
      }),
    ],
    { numRuns: 1000 },
  )(
    "behavior: sharePrice accepts received assets exactly down to the rounded bound",
    ({ shares, expected, tolerance }) => {
      const bound = (expected * (WAD - tolerance) + WAD - 1n) / WAD; // wMulUp
      fc.pre((bound * shares) % RAY !== 0n);
      const minAssets = (bound * shares + RAY - 1n) / RAY;
      const limits = (assetsReceived: bigint) => ({
        type: "vaultV2Redeem" as const,
        quote: { assetsReceived, sharesBurned: shares },
        slippageTolerance: WAD,
        sharePrice: { expected, tolerance },
      });
      const observed = (assetsReceived: bigint) => ({
        assetsReceived,
        sharesBurned: shares,
      });
      expect(
        checkSlippage({
          label: "Limit operation 0 (vaultV2Deposit)",
          limits: limits(minAssets),
          observed: observed(minAssets),
        }),
      ).toEqual({
        quote: { assetsReceived: minAssets, sharesBurned: shares },
        slippageTolerance: WAD,
        sharePrice: { expected, tolerance },
      });
      // A zero bound accepts every rate, so there is no asset amount below it.
      if (bound > 0n) {
        expect(() =>
          checkSlippage({
            label: "Limit operation 0 (vaultV2Deposit)",
            limits: limits(minAssets - 1n),
            observed: observed(minAssets - 1n),
          }),
        ).toThrow(ConsumerLimitViolationError);
      }
    },
  );
});
