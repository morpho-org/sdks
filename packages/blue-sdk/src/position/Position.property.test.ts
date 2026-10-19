import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import { marketInput, marketParams, USER } from "../__test__/fixtures.js";
import {
  isHealthy,
  maxBorrow,
  min,
  ORACLE_PRICE_SCALE,
  positionStateCase,
  seizedCollateral,
  toAssetsUp,
  WAD,
} from "../__test__/morphoModel.js";
import { AccrualPosition } from "./Position.js";

const positionCase = positionStateCase();

function createPosition(input: {
  totalBorrowAssets: bigint;
  totalBorrowShares: bigint;
  price: bigint;
  collateral: bigint;
  borrowShares: bigint;
  lltv: bigint;
}) {
  return new AccrualPosition(
    {
      user: USER,
      supplyShares: 0n,
      borrowShares: input.borrowShares,
      collateral: input.collateral,
    },
    marketInput({
      params: marketParams({ lltv: input.lltv }),
      totalBorrowAssets: input.totalBorrowAssets,
      totalBorrowShares: input.totalBorrowShares,
      price: input.price,
    }),
  );
}

// morpho-blue src/Morpho.sol _isHealthy
describe("AccrualPosition.isHealthy", () => {
  test.prop([positionCase], { numRuns: 1000 })("default", (input) => {
    expect(createPosition(input).isHealthy).toBe(
      isHealthy(
        input.collateral,
        input.borrowShares,
        input.totalBorrowAssets,
        input.totalBorrowShares,
        input.price,
        input.lltv,
      ),
    );
  });
});

// morpho-blue src/Morpho.sol _isHealthy
describe("AccrualPosition.isLiquidatable", () => {
  test.prop([positionCase], { numRuns: 1000 })("default", (input) => {
    expect(createPosition(input).isLiquidatable).toBe(
      !isHealthy(
        input.collateral,
        input.borrowShares,
        input.totalBorrowAssets,
        input.totalBorrowShares,
        input.price,
        input.lltv,
      ),
    );
  });
});

// morpho-blue src/Morpho.sol _isHealthy
describe("AccrualPosition.healthFactor", () => {
  test.prop([positionCase], { numRuns: 1000 })(
    "behavior: is at least WAD exactly when the position is healthy",
    (input) => {
      expect(createPosition(input).healthFactor! >= WAD).toBe(
        isHealthy(
          input.collateral,
          input.borrowShares,
          input.totalBorrowAssets,
          input.totalBorrowShares,
          input.price,
          input.lltv,
        ),
      );
    },
  );
});

// morpho-blue src/Morpho.sol liquidate
describe("AccrualPosition.seizableCollateral", () => {
  test.prop([positionCase], { numRuns: 1000 })(
    "behavior: never exceeds collateral and is zero when healthy",
    (input) => {
      const position = createPosition(input);
      const result = position.seizableCollateral!;
      const healthy = isHealthy(
        input.collateral,
        input.borrowShares,
        input.totalBorrowAssets,
        input.totalBorrowShares,
        input.price,
        input.lltv,
      );
      const expected =
        input.price === 0n || healthy
          ? 0n
          : min(
              input.collateral,
              seizedCollateral(
                input.borrowShares,
                input.totalBorrowAssets,
                input.totalBorrowShares,
                input.price,
                input.lltv,
              ),
            );

      expect(result).toBe(expected);
      expect(result).toBeLessThanOrEqual(input.collateral);
      if (healthy) expect(result).toBe(0n);
    },
  );
});

// morpho-blue src/Morpho.sol _isHealthy
describe("AccrualPosition.maxBorrowableAssets", () => {
  test.prop([positionCase], {
    examples: [
      [
        {
          totalBorrowAssets: 2n,
          totalBorrowShares: 0n,
          price: ORACLE_PRICE_SCALE,
          collateral: 2n,
          lltv: 915_000_000_000_000_000n,
          borrowShares: 0n,
        },
      ],
    ],
    numRuns: 1000,
  })("default", (input) => {
    const maximum = maxBorrow(input.collateral, input.price, input.lltv);
    const debtAssets = toAssetsUp(
      input.borrowShares,
      input.totalBorrowAssets,
      input.totalBorrowShares,
    );
    const upperBound = maximum > debtAssets ? maximum - debtAssets : 0n;
    const result = createPosition(input).maxBorrowableAssets;

    expect(result).toBeDefined();
    if (result === undefined) return;

    expect(result).toBeGreaterThanOrEqual(0n);
    expect(result).toBeLessThanOrEqual(upperBound);
  });
});
