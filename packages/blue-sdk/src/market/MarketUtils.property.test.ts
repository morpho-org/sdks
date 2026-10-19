// biome-ignore-all lint/complexity/useMaxParams: property callbacks mirror arbitrary tuples.
import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import { amount, total } from "../__test__/arbitraries.js";
import {
  ceilDiv,
  collateralValue,
  isHealthy,
  LIQUIDATION_CURSOR,
  liquidationIncentiveFactor,
  lltvArbitrary,
  MAX_LIQUIDATION_INCENTIVE_FACTOR,
  MAX_PRICE,
  MAX_UINT_128,
  maxBorrow,
  min,
  minCollateralForDebt,
  ORACLE_PRICE_SCALE,
  positionStateCase,
  positiveLltv,
  positiveUint128,
  priceArbitrary,
  seizedCollateral,
  toAssetsDown,
  toAssetsUp,
  toSharesDown,
  toSharesUp,
  uint128,
  VIRTUAL_ASSETS,
  VIRTUAL_SHARES,
  WAD,
} from "../__test__/morphoModel.js";
import {
  LIQUIDATION_CURSOR as SDK_LIQUIDATION_CURSOR,
  MAX_LIQUIDATION_INCENTIVE_FACTOR as SDK_MAX_LIQUIDATION_INCENTIVE_FACTOR,
  ORACLE_PRICE_SCALE as SDK_ORACLE_PRICE_SCALE,
} from "../constants.js";
import { MarketUtils } from "./MarketUtils.js";

// SharesMathLib.sol toAssetsDown and MorphoBalancesLib.sol expectedSupplyAssets.
describe("toSupplyAssets", () => {
  test.prop([amount, total, total], { numRuns: 1_000 })(
    "default",
    (shares, totalAssets, totalShares) => {
      const denominator = totalShares + VIRTUAL_SHARES;
      const numerator = shares * (totalAssets + 1n);

      expect(
        MarketUtils.toSupplyAssets(
          shares,
          { totalSupplyAssets: totalAssets, totalSupplyShares: totalShares },
          "Down",
        ),
      ).toBe(numerator / denominator);
      expect(
        MarketUtils.toSupplyAssets(
          shares,
          { totalSupplyAssets: totalAssets, totalSupplyShares: totalShares },
          "Up",
        ),
      ).toBe((numerator + denominator - 1n) / denominator);
    },
  );

  test.prop([amount, total, total], { numRuns: 1_000 })(
    "behavior: default rounding is Down",
    (shares, totalAssets, totalShares) => {
      expect(
        MarketUtils.toSupplyAssets(shares, {
          totalSupplyAssets: totalAssets,
          totalSupplyShares: totalShares,
        }),
      ).toBe((shares * (totalAssets + 1n)) / (totalShares + VIRTUAL_SHARES));
    },
  );
});

// morpho-blue/src/libraries/SharesMathLib.sol: toSharesDown and toSharesUp.
describe("toSupplyShares", () => {
  test.prop([amount, total, total], { numRuns: 1_000 })(
    "default",
    (assets, totalAssets, totalShares) => {
      const denominator = totalAssets + 1n;
      const numerator = assets * (totalShares + VIRTUAL_SHARES);

      expect(
        MarketUtils.toSupplyShares(
          assets,
          { totalSupplyAssets: totalAssets, totalSupplyShares: totalShares },
          "Down",
        ),
      ).toBe(numerator / denominator);
      expect(
        MarketUtils.toSupplyShares(
          assets,
          { totalSupplyAssets: totalAssets, totalSupplyShares: totalShares },
          "Up",
        ),
      ).toBe((numerator + denominator - 1n) / denominator);
    },
  );

  test.prop([amount, total, total], { numRuns: 1_000 })(
    "behavior: default rounding is Up",
    (assets, totalAssets, totalShares) => {
      const numerator = assets * (totalShares + VIRTUAL_SHARES);
      const denominator = totalAssets + 1n;

      expect(
        MarketUtils.toSupplyShares(assets, {
          totalSupplyAssets: totalAssets,
          totalSupplyShares: totalShares,
        }),
      ).toBe((numerator + denominator - 1n) / denominator);
    },
  );
});

// SharesMathLib.sol toAssetsUp and MorphoBalancesLib.sol expectedBorrowAssets.
describe("toBorrowAssets", () => {
  test.prop([amount, total, total], { numRuns: 1_000 })(
    "default",
    (shares, totalAssets, totalShares) => {
      const denominator = totalShares + VIRTUAL_SHARES;
      const numerator = shares * (totalAssets + 1n);

      expect(
        MarketUtils.toBorrowAssets(
          shares,
          { totalBorrowAssets: totalAssets, totalBorrowShares: totalShares },
          "Down",
        ),
      ).toBe(numerator / denominator);
      expect(
        MarketUtils.toBorrowAssets(
          shares,
          { totalBorrowAssets: totalAssets, totalBorrowShares: totalShares },
          "Up",
        ),
      ).toBe((numerator + denominator - 1n) / denominator);
    },
  );

  test.prop([amount, total, total], { numRuns: 1_000 })(
    "behavior: default rounding is Up",
    (shares, totalAssets, totalShares) => {
      const numerator = shares * (totalAssets + 1n);
      const denominator = totalShares + VIRTUAL_SHARES;

      expect(
        MarketUtils.toBorrowAssets(shares, {
          totalBorrowAssets: totalAssets,
          totalBorrowShares: totalShares,
        }),
      ).toBe((numerator + denominator - 1n) / denominator);
    },
  );
});

// morpho-blue/src/libraries/SharesMathLib.sol: toSharesDown and toSharesUp.
describe("toBorrowShares", () => {
  test.prop([amount, total, total], { numRuns: 1_000 })(
    "default",
    (assets, totalAssets, totalShares) => {
      const denominator = totalAssets + 1n;
      const numerator = assets * (totalShares + VIRTUAL_SHARES);

      expect(
        MarketUtils.toBorrowShares(
          assets,
          { totalBorrowAssets: totalAssets, totalBorrowShares: totalShares },
          "Down",
        ),
      ).toBe(numerator / denominator);
      expect(
        MarketUtils.toBorrowShares(
          assets,
          { totalBorrowAssets: totalAssets, totalBorrowShares: totalShares },
          "Up",
        ),
      ).toBe((numerator + denominator - 1n) / denominator);
    },
  );

  test.prop([amount, total, total], { numRuns: 1_000 })(
    "behavior: default rounding is Down",
    (assets, totalAssets, totalShares) => {
      expect(
        MarketUtils.toBorrowShares(assets, {
          totalBorrowAssets: totalAssets,
          totalBorrowShares: totalShares,
        }),
      ).toBe((assets * (totalShares + VIRTUAL_SHARES)) / (totalAssets + 1n));
    },
  );
});
const MAX_UINT_256 = (1n << 256n) - 1n;

const marketCase = positionStateCase();
const positiveLltvMarketCase = positionStateCase(positiveLltv);

const healthyMarketCase = fc
  .record({
    totalBorrowAssets: uint128,
    totalBorrowShares: uint128,
    price: priceArbitrary,
    collateral: positiveUint128,
    lltv: positiveLltv,
  })
  .chain(
    ({ totalBorrowAssets, totalBorrowShares, price, collateral, lltv }) => {
      const maxHealthyShares = min(
        totalBorrowShares,
        (maxBorrow(collateral, price, lltv) *
          (totalBorrowShares + VIRTUAL_SHARES)) /
          (totalBorrowAssets + VIRTUAL_ASSETS),
      );

      return fc.record({
        totalBorrowAssets: fc.constant(totalBorrowAssets),
        totalBorrowShares: fc.constant(totalBorrowShares),
        price: fc.constant(price),
        collateral: fc.constant(collateral),
        lltv: fc.constant(lltv),
        borrowShares: fc.bigInt({ min: 0n, max: maxHealthyShares }),
      });
    },
  );

const boundaryRoundingMargin = ceilDiv(MAX_PRICE, ORACLE_PRICE_SCALE) + 2n;

const shareBoundaryCase = fc
  .record({
    totalBorrowAssets: fc.oneof(
      {
        weight: 49,
        arbitrary: fc.bigInt({
          min: VIRTUAL_SHARES * 1_000n,
          max: MAX_UINT_128,
        }),
      },
      {
        weight: 1,
        arbitrary: uint128,
      },
    ),
  })
  .chain(({ totalBorrowAssets }) => {
    const scaledShares =
      totalBorrowAssets > 0n ? totalBorrowAssets : VIRTUAL_SHARES * 1_000n;

    return fc
      .record({
        totalBorrowAssets: fc.constant(totalBorrowAssets),
        totalBorrowShares: fc.oneof(
          {
            weight: 49,
            arbitrary: fc.constant(scaledShares),
          },
          {
            weight: 1,
            arbitrary: fc.bigInt({ min: 2n, max: MAX_UINT_128 }),
          },
        ),
        price: fc.oneof(
          {
            weight: 49,
            arbitrary: fc.constant(ORACLE_PRICE_SCALE),
          },
          {
            weight: 1,
            arbitrary: priceArbitrary,
          },
        ),
        lltv: fc.oneof(
          {
            weight: 49,
            arbitrary: fc.constant(WAD - 1n),
          },
          {
            weight: 1,
            arbitrary: positiveLltv,
          },
        ),
      })
      .chain((input) => {
        const maximumSupportedDebt =
          maxBorrow(MAX_UINT_128 - 1_000_000n, input.price, input.lltv) -
          boundaryRoundingMargin;
        const maximumTargetShares = min(
          min(input.totalBorrowShares - 1n, input.totalBorrowShares / 2n),
          toSharesDown(
            maximumSupportedDebt > 0n ? maximumSupportedDebt : 0n,
            input.totalBorrowAssets,
            input.totalBorrowShares,
          ),
        );

        if (maximumTargetShares < 1n)
          return fc.constant({
            ...input,
            collateral: MAX_UINT_128 + 1n,
          });

        return fc
          .bigInt({ min: 1n, max: maximumTargetShares })
          .map((targetShares) => {
            const targetDebt = toAssetsUp(
              targetShares,
              input.totalBorrowAssets,
              input.totalBorrowShares,
            );
            const collateral = ceilDiv(
              ceilDiv(targetDebt * WAD, input.lltv) * ORACLE_PRICE_SCALE,
              input.price,
            );

            return { ...input, collateral };
          });
      });
  });

const equalityBoundaryCase = fc
  .record({
    totalBorrowAssets: uint128,
    k: fc.bigInt({ min: 1n, max: 1n << 20n }),
    price: fc.oneof(
      {
        weight: 49,
        arbitrary: fc.constant(ORACLE_PRICE_SCALE),
      },
      {
        weight: 1,
        arbitrary: priceArbitrary,
      },
    ),
    lltv: fc.oneof(
      {
        weight: 49,
        arbitrary: fc.constant(WAD - 1n),
      },
      {
        weight: 1,
        arbitrary: positiveLltv,
      },
    ),
  })
  .chain((input) => {
    const minimumAssets =
      ceilDiv(
        VIRTUAL_SHARES + (boundaryRoundingMargin + 1n) * input.k + 1n,
        input.k,
      ) - VIRTUAL_ASSETS;
    const maximumAssets = min(
      MAX_UINT_128,
      (MAX_UINT_128 + VIRTUAL_SHARES) / input.k - VIRTUAL_ASSETS,
    );
    const totalBorrowAssets =
      input.totalBorrowAssets < minimumAssets
        ? minimumAssets
        : input.totalBorrowAssets > maximumAssets
          ? maximumAssets
          : input.totalBorrowAssets;
    const totalBorrowShares =
      input.k * (totalBorrowAssets + VIRTUAL_ASSETS) - VIRTUAL_SHARES;
    const maximumTargetDebt = min(
      (totalBorrowShares - 1n) / input.k - boundaryRoundingMargin,
      maxBorrow(MAX_UINT_128 - 1_000_000n, input.price, input.lltv) -
        boundaryRoundingMargin,
    );

    if (maximumTargetDebt < 1n)
      return fc.constant({
        ...input,
        totalBorrowAssets,
        totalBorrowShares,
        collateral: MAX_UINT_128 + 1n,
      });

    return fc.bigInt({ min: 1n, max: maximumTargetDebt }).map((targetDebt) => ({
      ...input,
      totalBorrowAssets,
      totalBorrowShares,
      collateral: ceilDiv(
        ceilDiv(targetDebt * WAD, input.lltv) * ORACLE_PRICE_SCALE,
        input.price,
      ),
    }));
  });

const liquidationPriceCase = fc
  .record({
    totalBorrowAssets: uint128,
    totalBorrowShares: positiveUint128,
    collateral: positiveUint128,
    lltv: positiveLltv,
  })
  .chain(({ totalBorrowAssets, totalBorrowShares, collateral, lltv }) =>
    fc.record({
      totalBorrowAssets: fc.constant(totalBorrowAssets),
      totalBorrowShares: fc.constant(totalBorrowShares),
      collateral: fc.constant(collateral),
      lltv: fc.constant(lltv),
      borrowShares: fc.bigInt({
        min: 1n,
        max: totalBorrowShares,
      }),
    }),
  );

const sharesForSeizedCollateral = (
  seizedAssets: bigint,
  totalBorrowAssets: bigint,
  totalBorrowShares: bigint,
  oraclePrice: bigint,
  liquidationLtv: bigint,
) =>
  toSharesUp(
    ceilDiv(
      ceilDiv(seizedAssets * oraclePrice, ORACLE_PRICE_SCALE) * WAD,
      liquidationIncentiveFactor(liquidationLtv),
    ),
    totalBorrowAssets,
    totalBorrowShares,
  );

// morpho-blue src/Morpho.sol liquidate
describe("getLiquidationIncentiveFactor", () => {
  test.prop([lltvArbitrary], { numRuns: 1000 })("default", (liquidationLtv) => {
    expect(
      MarketUtils.getLiquidationIncentiveFactor({ lltv: liquidationLtv }),
    ).toBe(liquidationIncentiveFactor(liquidationLtv));
  });

  test("behavior: SDK liquidation constants equal ConstantsLib.sol", () => {
    expect(SDK_LIQUIDATION_CURSOR).toBe(LIQUIDATION_CURSOR);
    expect(SDK_MAX_LIQUIDATION_INCENTIVE_FACTOR).toBe(
      MAX_LIQUIDATION_INCENTIVE_FACTOR,
    );
    expect(SDK_ORACLE_PRICE_SCALE).toBe(ORACLE_PRICE_SCALE);
  });

  test.prop([fc.tuple(lltvArbitrary, lltvArbitrary)], { numRuns: 1000 })(
    "behavior: stays within bounds and does not increase with LLTV",
    ([first, second]) => {
      const lower = first < second ? first : second;
      const higher = first < second ? second : first;
      const lowerFactor = MarketUtils.getLiquidationIncentiveFactor({
        lltv: lower,
      });
      const higherFactor = MarketUtils.getLiquidationIncentiveFactor({
        lltv: higher,
      });

      expect(lowerFactor).toBeGreaterThanOrEqual(WAD);
      expect(lowerFactor).toBeLessThanOrEqual(MAX_LIQUIDATION_INCENTIVE_FACTOR);
      expect(higherFactor).toBeGreaterThanOrEqual(WAD);
      expect(higherFactor).toBeLessThanOrEqual(lowerFactor);
    },
  );
});

// morpho-blue src/Morpho.sol _isHealthy
describe("isHealthy", () => {
  test.prop([marketCase], { numRuns: 1000 })("default", (input) => {
    expect(
      MarketUtils.isHealthy(
        input,
        {
          totalBorrowAssets: input.totalBorrowAssets,
          totalBorrowShares: input.totalBorrowShares,
          price: input.price,
        },
        { lltv: input.lltv },
      ),
    ).toBe(
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

  test("behavior: returns undefined when the oracle price is missing", () => {
    expect(
      MarketUtils.isHealthy(
        { collateral: 1n, borrowShares: 0n },
        { totalBorrowAssets: 0n, totalBorrowShares: 0n },
        { lltv: WAD / 2n },
      ),
    ).toBeUndefined();
  });

  test.prop([shareBoundaryCase], { numRuns: 1000 })(
    "behavior: changes health at the share boundary",
    (input) => {
      fc.pre(input.collateral <= MAX_UINT_128);

      const maxBorrowAssets = maxBorrow(
        input.collateral,
        input.price,
        input.lltv,
      );
      const boundaryShares =
        (maxBorrowAssets * (input.totalBorrowShares + VIRTUAL_SHARES)) /
        (input.totalBorrowAssets + VIRTUAL_ASSETS);

      fc.pre(boundaryShares > 0n);
      fc.pre(boundaryShares + 1n <= MAX_UINT_128);
      fc.pre(boundaryShares + 1n <= input.totalBorrowShares);

      const market = {
        totalBorrowAssets: input.totalBorrowAssets,
        totalBorrowShares: input.totalBorrowShares,
        price: input.price,
      };

      expect(
        MarketUtils.isHealthy(
          { collateral: input.collateral, borrowShares: boundaryShares },
          market,
          { lltv: input.lltv },
        ),
      ).toBe(true);
      expect(
        MarketUtils.isHealthy(
          { collateral: input.collateral, borrowShares: boundaryShares + 1n },
          market,
          { lltv: input.lltv },
        ),
      ).toBe(false);
    },
  );

  test.prop([equalityBoundaryCase], { numRuns: 1000 })(
    "behavior: distinguishes equality at the LLTV boundary",
    (input) => {
      fc.pre(input.totalBorrowShares <= MAX_UINT_128);
      fc.pre(input.collateral <= MAX_UINT_128);

      const maxBorrowAssets = maxBorrow(
        input.collateral,
        input.price,
        input.lltv,
      );
      fc.pre(maxBorrowAssets > 0n);
      const boundaryShares = maxBorrowAssets * input.k;

      fc.pre(boundaryShares > 0n);
      fc.pre(boundaryShares + 1n <= MAX_UINT_128);
      fc.pre(boundaryShares + 1n <= input.totalBorrowShares);

      const market = {
        totalBorrowAssets: input.totalBorrowAssets,
        totalBorrowShares: input.totalBorrowShares,
        price: input.price,
      };

      expect(
        toAssetsUp(
          boundaryShares,
          input.totalBorrowAssets,
          input.totalBorrowShares,
        ),
      ).toBe(maxBorrowAssets);
      expect(
        MarketUtils.isHealthy(
          { collateral: input.collateral, borrowShares: boundaryShares },
          market,
          { lltv: input.lltv },
        ),
      ).toBe(true);
      expect(
        MarketUtils.isHealthy(
          {
            collateral: input.collateral,
            borrowShares: boundaryShares + 1n,
          },
          market,
          { lltv: input.lltv },
        ),
      ).toBe(false);
    },
  );
});

// morpho-blue src/Morpho.sol _isHealthy
describe("getHealthFactor", () => {
  test.prop([marketCase], { numRuns: 1000 })("default", (input) => {
    const debtAssets = toAssetsUp(
      input.borrowShares,
      input.totalBorrowAssets,
      input.totalBorrowShares,
    );
    const expected =
      debtAssets === 0n
        ? MAX_UINT_256
        : (maxBorrow(input.collateral, input.price, input.lltv) * WAD) /
          debtAssets;

    expect(
      MarketUtils.getHealthFactor(
        input,
        {
          totalBorrowAssets: input.totalBorrowAssets,
          totalBorrowShares: input.totalBorrowShares,
          price: input.price,
        },
        { lltv: input.lltv },
      ),
    ).toBe(expected);
  });

  test.prop([marketCase], { numRuns: 1000 })(
    "behavior: is at least WAD exactly when the position is healthy",
    (input) => {
      const healthFactor = MarketUtils.getHealthFactor(
        input,
        {
          totalBorrowAssets: input.totalBorrowAssets,
          totalBorrowShares: input.totalBorrowShares,
          price: input.price,
        },
        { lltv: input.lltv },
      );

      expect(healthFactor! >= WAD).toBe(
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

// morpho-blue src/Morpho.sol _isHealthy
describe("getLtv", () => {
  test.prop([marketCase], { numRuns: 1000 })("default", (input) => {
    const collateralValueInLoanAssets = collateralValue(
      input.collateral,
      input.price,
    );
    const debtAssets = toAssetsUp(
      input.borrowShares,
      input.totalBorrowAssets,
      input.totalBorrowShares,
    );
    const expected =
      input.borrowShares === 0n || input.totalBorrowShares === 0n
        ? null
        : collateralValueInLoanAssets === 0n
          ? MAX_UINT_256
          : ceilDiv(debtAssets * WAD, collateralValueInLoanAssets);

    expect(
      MarketUtils.getLtv(input, {
        totalBorrowAssets: input.totalBorrowAssets,
        totalBorrowShares: input.totalBorrowShares,
        price: input.price,
      }),
    ).toBe(expected);
  });

  test.prop([marketCase], { numRuns: 1000 })(
    "behavior: is at most LLTV exactly when the numeric LTV is below max",
    (input) => {
      const ltv = MarketUtils.getLtv(input, {
        totalBorrowAssets: input.totalBorrowAssets,
        totalBorrowShares: input.totalBorrowShares,
        price: input.price,
      });

      if (ltv == null || ltv === MAX_UINT_256) return;

      expect(ltv <= input.lltv).toBe(
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

// morpho-blue src/Morpho.sol _isHealthy
describe("getBorrowCapacityUsage", () => {
  test.prop([marketCase], { numRuns: 1000 })("default", (input) => {
    const debtAssets = toAssetsUp(
      input.borrowShares,
      input.totalBorrowAssets,
      input.totalBorrowShares,
    );
    const hf: bigint =
      debtAssets === 0n
        ? MAX_UINT_256
        : (maxBorrow(input.collateral, input.price, input.lltv) * WAD) /
          debtAssets;
    const expected = hf === 0n ? MAX_UINT_256 : ceilDiv(WAD * WAD, hf);

    expect(
      MarketUtils.getBorrowCapacityUsage(
        input,
        {
          totalBorrowAssets: input.totalBorrowAssets,
          totalBorrowShares: input.totalBorrowShares,
          price: input.price,
        },
        { lltv: input.lltv },
      ),
    ).toBe(expected);
  });

  test.prop([marketCase], { numRuns: 1000 })(
    "behavior: is at most WAD exactly when the position is healthy",
    (input) => {
      const usage = MarketUtils.getBorrowCapacityUsage(
        input,
        {
          totalBorrowAssets: input.totalBorrowAssets,
          totalBorrowShares: input.totalBorrowShares,
          price: input.price,
        },
        { lltv: input.lltv },
      );

      expect(usage! <= WAD).toBe(
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

// morpho-blue src/Morpho.sol _isHealthy
describe("getMaxBorrowAssets", () => {
  test.prop([marketCase], { numRuns: 1000 })("default", (input) => {
    expect(
      MarketUtils.getMaxBorrowAssets(
        input.collateral,
        { price: input.price },
        { lltv: input.lltv },
      ),
    ).toBe(maxBorrow(input.collateral, input.price, input.lltv));
  });
});

// morpho-blue src/Morpho.sol borrow
describe("getMaxBorrowableAssets", () => {
  test.prop([marketCase], {
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
    const result = MarketUtils.getMaxBorrowableAssets(
      input,
      {
        totalBorrowAssets: input.totalBorrowAssets,
        totalBorrowShares: input.totalBorrowShares,
        price: input.price,
      },
      { lltv: input.lltv },
    );
    const maximum = maxBorrow(input.collateral, input.price, input.lltv);
    const debtAssets = toAssetsUp(
      input.borrowShares,
      input.totalBorrowAssets,
      input.totalBorrowShares,
    );
    const upperBound = maximum > debtAssets ? maximum - debtAssets : 0n;

    expect(result).toBeDefined();
    if (result === undefined) return;

    expect(result).toBeGreaterThanOrEqual(0n);
    expect(result).toBeLessThanOrEqual(upperBound);
  });

  test.prop([healthyMarketCase], { numRuns: 1000 })(
    "behavior: borrowing more than the result makes the position unhealthy",
    (input) => {
      const result = MarketUtils.getMaxBorrowableAssets(
        input,
        {
          totalBorrowAssets: input.totalBorrowAssets,
          totalBorrowShares: input.totalBorrowShares,
          price: input.price,
        },
        { lltv: input.lltv },
      );
      expect(result).toBeDefined();
      if (result === undefined) return;

      const resultPlusOne = result + 1n;
      const sharesPlusOne = toSharesUp(
        resultPlusOne,
        input.totalBorrowAssets,
        input.totalBorrowShares,
      );
      if (
        input.totalBorrowAssets + resultPlusOne > MAX_UINT_128 ||
        input.totalBorrowShares + sharesPlusOne > MAX_UINT_128
      ) {
        return;
      }

      expect(
        isHealthy(
          input.collateral,
          input.borrowShares + sharesPlusOne,
          input.totalBorrowAssets + resultPlusOne,
          input.totalBorrowShares + sharesPlusOne,
          input.price,
          input.lltv,
        ),
      ).toBe(false);
    },
  );

  // Morpho.borrow rounds newly issued debt shares up, which can add one wei of debt.
  test.fails.prop([healthyMarketCase], {
    numRuns: 1000,
    examples: [
      [
        {
          totalBorrowAssets: 5n,
          totalBorrowShares: 0n,
          price: 1n,
          collateral: 64n * ORACLE_PRICE_SCALE,
          lltv: 915_000_000_000_000_000n,
          borrowShares: 0n,
        },
      ],
      [
        {
          totalBorrowAssets: 1_828_572n,
          totalBorrowShares: 0n,
          price: 1n,
          collateral: 70n * ORACLE_PRICE_SCALE,
          lltv: 915_000_000_000_000_000n,
          borrowShares: 0n,
        },
      ],
    ],
  })(
    "behavior: borrowing exactly the result keeps the position healthy",
    (input) => {
      const result = MarketUtils.getMaxBorrowableAssets(
        input,
        {
          totalBorrowAssets: input.totalBorrowAssets,
          totalBorrowShares: input.totalBorrowShares,
          price: input.price,
        },
        { lltv: input.lltv },
      );
      if (result === undefined || result < 1n) return;

      const shares = toSharesUp(
        result,
        input.totalBorrowAssets,
        input.totalBorrowShares,
      );
      if (
        input.totalBorrowAssets + result > MAX_UINT_128 ||
        input.totalBorrowShares + shares > MAX_UINT_128
      ) {
        return;
      }

      expect(
        isHealthy(
          input.collateral,
          input.borrowShares + shares,
          input.totalBorrowAssets + result,
          input.totalBorrowShares + shares,
          input.price,
          input.lltv,
        ),
      ).toBe(true);
    },
  );
});

// morpho-blue src/Morpho.sol liquidate
describe("getLiquidationSeizedAssets", () => {
  test.prop([marketCase], { numRuns: 1000 })("default", (input) => {
    expect(
      MarketUtils.getLiquidationSeizedAssets(
        input.borrowShares,
        {
          totalBorrowAssets: input.totalBorrowAssets,
          totalBorrowShares: input.totalBorrowShares,
          price: input.price,
        },
        { lltv: input.lltv },
      ),
    ).toBe(
      seizedCollateral(
        input.borrowShares,
        input.totalBorrowAssets,
        input.totalBorrowShares,
        input.price,
        input.lltv,
      ),
    );
  });

  test.prop([marketCase], { numRuns: 1000 })(
    "behavior: rounds in favor of the protocol",
    (input) => {
      const seized = MarketUtils.getLiquidationSeizedAssets(
        input.borrowShares,
        {
          totalBorrowAssets: input.totalBorrowAssets,
          totalBorrowShares: input.totalBorrowShares,
          price: input.price,
        },
        { lltv: input.lltv },
      )!;

      expect(seized * input.price * WAD).toBeLessThanOrEqual(
        toAssetsDown(
          input.borrowShares,
          input.totalBorrowAssets,
          input.totalBorrowShares,
        ) *
          liquidationIncentiveFactor(input.lltv) *
          ORACLE_PRICE_SCALE,
      );
    },
  );

  test.prop(
    [
      marketCase.chain((input) =>
        fc.record({
          input: fc.constant(input),
          first: fc.bigInt({ min: 0n, max: input.totalBorrowShares }),
          second: fc.bigInt({ min: 0n, max: input.totalBorrowShares }),
        }),
      ),
    ],
    { numRuns: 1000 },
  )(
    "behavior: is non-decreasing in repaid shares",
    ({ input, first, second }) => {
      const lower = first < second ? first : second;
      const higher = first < second ? second : first;

      expect(
        MarketUtils.getLiquidationSeizedAssets(
          lower,
          {
            totalBorrowAssets: input.totalBorrowAssets,
            totalBorrowShares: input.totalBorrowShares,
            price: input.price,
          },
          { lltv: input.lltv },
        ),
      ).toBeLessThanOrEqual(
        MarketUtils.getLiquidationSeizedAssets(
          higher,
          {
            totalBorrowAssets: input.totalBorrowAssets,
            totalBorrowShares: input.totalBorrowShares,
            price: input.price,
          },
          { lltv: input.lltv },
        )!,
      );
    },
  );

  test("behavior: returns undefined when the oracle price is missing", () => {
    expect(
      MarketUtils.getLiquidationSeizedAssets(
        1n,
        { totalBorrowAssets: 1n, totalBorrowShares: 1n },
        { lltv: WAD / 2n },
      ),
    ).toBeUndefined();
  });

  test("behavior: returns zero for a zero oracle price", () => {
    expect(
      MarketUtils.getLiquidationSeizedAssets(
        1n,
        {
          totalBorrowAssets: 1n,
          totalBorrowShares: 1n,
          price: 0n,
        },
        { lltv: WAD / 2n },
      ),
    ).toBe(0n);
  });
});

// morpho-blue src/Morpho.sol liquidate
describe("getLiquidationRepaidShares", () => {
  test.prop([marketCase], { numRuns: 1000 })("default", (input) => {
    const expected = sharesForSeizedCollateral(
      input.collateral,
      input.totalBorrowAssets,
      input.totalBorrowShares,
      input.price,
      input.lltv,
    );

    expect(
      MarketUtils.getLiquidationRepaidShares(
        input.collateral,
        {
          totalBorrowAssets: input.totalBorrowAssets,
          totalBorrowShares: input.totalBorrowShares,
          price: input.price,
        },
        { lltv: input.lltv },
      ),
    ).toBe(expected);
  });

  test.prop([marketCase], { numRuns: 1000 })(
    "behavior: rounds in favor of the protocol",
    (input) => {
      const shares = MarketUtils.getLiquidationRepaidShares(
        input.collateral,
        {
          totalBorrowAssets: input.totalBorrowAssets,
          totalBorrowShares: input.totalBorrowShares,
          price: input.price,
        },
        { lltv: input.lltv },
      )!;

      expect(
        toAssetsUp(shares, input.totalBorrowAssets, input.totalBorrowShares) *
          liquidationIncentiveFactor(input.lltv) *
          ORACLE_PRICE_SCALE,
      ).toBeGreaterThanOrEqual(input.collateral * input.price * WAD);
    },
  );

  test.prop(
    [
      marketCase.chain((input) =>
        fc.record({
          input: fc.constant(input),
          first: uint128,
          second: uint128,
        }),
      ),
    ],
    { numRuns: 1000 },
  )(
    "behavior: is non-decreasing in seized collateral",
    ({ input, first, second }) => {
      const lower = first < second ? first : second;
      const higher = first < second ? second : first;

      expect(
        MarketUtils.getLiquidationRepaidShares(
          lower,
          {
            totalBorrowAssets: input.totalBorrowAssets,
            totalBorrowShares: input.totalBorrowShares,
            price: input.price,
          },
          { lltv: input.lltv },
        ),
      ).toBeLessThanOrEqual(
        MarketUtils.getLiquidationRepaidShares(
          higher,
          {
            totalBorrowAssets: input.totalBorrowAssets,
            totalBorrowShares: input.totalBorrowShares,
            price: input.price,
          },
          { lltv: input.lltv },
        )!,
      );
    },
  );

  test("behavior: returns undefined when the oracle price is missing", () => {
    expect(
      MarketUtils.getLiquidationRepaidShares(
        1n,
        { totalBorrowAssets: 1n, totalBorrowShares: 1n },
        { lltv: WAD / 2n },
      ),
    ).toBeUndefined();
  });

  test("behavior: returns zero for a zero oracle price", () => {
    expect(
      MarketUtils.getLiquidationRepaidShares(
        1n,
        {
          totalBorrowAssets: 1n,
          totalBorrowShares: 1n,
          price: 0n,
        },
        { lltv: WAD / 2n },
      ),
    ).toBe(0n);
  });
});

// morpho-blue src/Morpho.sol liquidate
describe("getSeizableCollateral", () => {
  test.prop([marketCase], { numRuns: 1000 })("default", (input) => {
    const expected =
      input.price === 0n ||
      isHealthy(
        input.collateral,
        input.borrowShares,
        input.totalBorrowAssets,
        input.totalBorrowShares,
        input.price,
        input.lltv,
      )
        ? 0n
        : input.collateral <
            seizedCollateral(
              input.borrowShares,
              input.totalBorrowAssets,
              input.totalBorrowShares,
              input.price,
              input.lltv,
            )
          ? input.collateral
          : seizedCollateral(
              input.borrowShares,
              input.totalBorrowAssets,
              input.totalBorrowShares,
              input.price,
              input.lltv,
            );

    expect(
      MarketUtils.getSeizableCollateral(
        input,
        {
          totalBorrowAssets: input.totalBorrowAssets,
          totalBorrowShares: input.totalBorrowShares,
          price: input.price,
        },
        { lltv: input.lltv },
      ),
    ).toBe(expected);
  });

  test.prop([marketCase], { numRuns: 1000 })(
    "behavior: never exceeds the collateral balance",
    (input) => {
      expect(
        MarketUtils.getSeizableCollateral(
          input,
          {
            totalBorrowAssets: input.totalBorrowAssets,
            totalBorrowShares: input.totalBorrowShares,
            price: input.price,
          },
          { lltv: input.lltv },
        )!,
      ).toBeLessThanOrEqual(input.collateral);
    },
  );

  test.prop([healthyMarketCase], { numRuns: 1000 })(
    "behavior: is zero for a healthy position",
    (input) => {
      expect(
        MarketUtils.getSeizableCollateral(
          input,
          {
            totalBorrowAssets: input.totalBorrowAssets,
            totalBorrowShares: input.totalBorrowShares,
            price: input.price,
          },
          { lltv: input.lltv },
        ),
      ).toBe(0n);
    },
  );

  test("behavior: returns zero for a zero oracle price", () => {
    expect(
      MarketUtils.getSeizableCollateral(
        { collateral: 1n, borrowShares: 1n },
        { totalBorrowAssets: 1n, totalBorrowShares: 1n, price: 0n },
        { lltv: WAD / 2n },
      ),
    ).toBe(0n);
  });

  test.prop([marketCase], {
    numRuns: 1000,
    examples: [
      [
        {
          totalBorrowAssets: 1n,
          totalBorrowShares:
            80_559_764_635_472_452_051_030_883_097_181_777_593n,
          price: 1n,
          collateral: 4n * ORACLE_PRICE_SCALE,
          lltv: 500_000_000_000_000_000n,
          borrowShares: 40_279_882_317_736_226_025_515_441_548_591_388_797n,
        },
      ],
    ],
  })("behavior: can be seized by a valid liquidation call", (input) => {
    const result = MarketUtils.getSeizableCollateral(
      input,
      {
        totalBorrowAssets: input.totalBorrowAssets,
        totalBorrowShares: input.totalBorrowShares,
        price: input.price,
      },
      { lltv: input.lltv },
    )!;
    const healthy = isHealthy(
      input.collateral,
      input.borrowShares,
      input.totalBorrowAssets,
      input.totalBorrowShares,
      input.price,
      input.lltv,
    );

    if (healthy) {
      expect(result).toBe(0n);
      return;
    }
    if (input.price <= 0n || result === 0n) return;

    const seizedInRepaidSharesMode = seizedCollateral(
      input.borrowShares,
      input.totalBorrowAssets,
      input.totalBorrowShares,
      input.price,
      input.lltv,
    );

    if (result === seizedInRepaidSharesMode) return;

    expect(result).toBe(input.collateral);
    expect(
      sharesForSeizedCollateral(
        result,
        input.totalBorrowAssets,
        input.totalBorrowShares,
        input.price,
        input.lltv,
      ),
    ).toBeLessThanOrEqual(input.borrowShares);
  });
});

// morpho-blue src/Morpho.sol withdrawCollateral and _isHealthy
describe("getWithdrawableCollateral", () => {
  test.prop([positiveLltvMarketCase], { numRuns: 1000 })("default", (input) => {
    const result = MarketUtils.getWithdrawableCollateral(
      input,
      {
        totalBorrowAssets: input.totalBorrowAssets,
        totalBorrowShares: input.totalBorrowShares,
        price: input.price,
      },
      { lltv: input.lltv },
    );

    expect(result!).toBeLessThanOrEqual(input.collateral);
    if (input.borrowShares === 0n) expect(result).toBe(input.collateral);
  });

  test("behavior: returns zero for a zero oracle price", () => {
    expect(
      MarketUtils.getWithdrawableCollateral(
        { collateral: 1n, borrowShares: 1n },
        { totalBorrowAssets: 1n, totalBorrowShares: 1n, price: 0n },
        { lltv: WAD / 2n },
      ),
    ).toBe(0n);
  });

  test.prop([healthyMarketCase], { numRuns: 1000 })(
    "behavior: the reference threshold is exact",
    (input) => {
      if (input.borrowShares === 0n || input.lltv === 0n) return;

      const debtAssets = toAssetsUp(
        input.borrowShares,
        input.totalBorrowAssets,
        input.totalBorrowShares,
      );
      const minimumCollateral = minCollateralForDebt(
        debtAssets,
        input.price,
        input.lltv,
      );
      if (minimumCollateral > MAX_UINT_128) return;

      expect(
        isHealthy(
          minimumCollateral,
          input.borrowShares,
          input.totalBorrowAssets,
          input.totalBorrowShares,
          input.price,
          input.lltv,
        ),
      ).toBe(true);
      if (minimumCollateral > 0n) {
        expect(
          isHealthy(
            minimumCollateral - 1n,
            input.borrowShares,
            input.totalBorrowAssets,
            input.totalBorrowShares,
            input.price,
            input.lltv,
          ),
        ).toBe(false);
      }
    },
  );

  test.prop([positiveLltvMarketCase, uint128], { numRuns: 1000 })(
    "behavior: is non-decreasing in collateral",
    (input, delta) => {
      const largerCollateral = min(MAX_UINT_128, input.collateral + delta);
      const result = MarketUtils.getWithdrawableCollateral(
        input,
        {
          totalBorrowAssets: input.totalBorrowAssets,
          totalBorrowShares: input.totalBorrowShares,
          price: input.price,
        },
        { lltv: input.lltv },
      );
      const largerResult = MarketUtils.getWithdrawableCollateral(
        { ...input, collateral: largerCollateral },
        {
          totalBorrowAssets: input.totalBorrowAssets,
          totalBorrowShares: input.totalBorrowShares,
          price: input.price,
        },
        { lltv: input.lltv },
      );

      expect(result).toBeDefined();
      expect(largerResult).toBeDefined();
      if (result === undefined || largerResult === undefined) return;

      expect(largerResult).toBeGreaterThanOrEqual(result);
    },
  );

  test.prop([positiveLltvMarketCase, uint128], { numRuns: 1000 })(
    "behavior: is non-increasing in borrow shares",
    (input, delta) => {
      const largerBorrowShares = min(
        input.totalBorrowShares,
        input.borrowShares + delta,
      );
      const result = MarketUtils.getWithdrawableCollateral(
        input,
        {
          totalBorrowAssets: input.totalBorrowAssets,
          totalBorrowShares: input.totalBorrowShares,
          price: input.price,
        },
        { lltv: input.lltv },
      );
      const largerResult = MarketUtils.getWithdrawableCollateral(
        { ...input, borrowShares: largerBorrowShares },
        {
          totalBorrowAssets: input.totalBorrowAssets,
          totalBorrowShares: input.totalBorrowShares,
          price: input.price,
        },
        { lltv: input.lltv },
      );

      expect(result).toBeDefined();
      expect(largerResult).toBeDefined();
      if (result === undefined || largerResult === undefined) return;

      expect(largerResult).toBeLessThanOrEqual(result);
    },
  );

  // The SDK's inverse rounding can differ from Morpho's minimum collateral threshold.
  test.fails.prop([healthyMarketCase], {
    numRuns: 1000,
    examples: [
      [
        {
          totalBorrowAssets: 1_000_000_000_000_000_000_000_000n,
          totalBorrowShares: 1_000_000_000_000_000_000_000_000_000_000n,
          price: 1_000_000_000_000_000_000_000_000_000_000n,
          collateral: 10_000_000_000_000_000_000_000_000n,
          lltv: 860_000_000_000_000_000n,
          borrowShares: 5_000_000_000_000_000_000_000_000n,
        },
      ],
      [
        {
          totalBorrowAssets: 0n,
          totalBorrowShares: 2n,
          price: 1n,
          collateral: 20n * ORACLE_PRICE_SCALE,
          lltv: 50_000_000_000_000_001n,
          borrowShares: 1n,
        },
      ],
    ],
  })("behavior: equals the Solidity maximum withdrawable amount", (input) => {
    if (input.borrowShares === 0n) return;

    const debtAssets = toAssetsUp(
      input.borrowShares,
      input.totalBorrowAssets,
      input.totalBorrowShares,
    );
    const minimumCollateral = minCollateralForDebt(
      debtAssets,
      input.price,
      input.lltv,
    );
    if (minimumCollateral > MAX_UINT_128) return;

    const expected =
      input.collateral > minimumCollateral
        ? input.collateral - minimumCollateral
        : 0n;
    expect(
      MarketUtils.getWithdrawableCollateral(
        input,
        {
          totalBorrowAssets: input.totalBorrowAssets,
          totalBorrowShares: input.totalBorrowShares,
          price: input.price,
        },
        { lltv: input.lltv },
      ),
    ).toBe(expected);
  });
});

// morpho-blue src/Morpho.sol _isHealthy
describe("getLiquidationPrice", () => {
  test.prop([positiveLltvMarketCase], { numRuns: 1000 })("default", (input) => {
    const result = MarketUtils.getLiquidationPrice(
      input,
      {
        totalBorrowAssets: input.totalBorrowAssets,
        totalBorrowShares: input.totalBorrowShares,
      },
      { lltv: input.lltv },
    );

    if (input.borrowShares === 0n || input.totalBorrowShares === 0n) {
      expect(result).toBeNull();
    } else if (input.collateral === 0n) {
      const debtAssets = toAssetsUp(
        input.borrowShares,
        input.totalBorrowAssets,
        input.totalBorrowShares,
      );
      if (debtAssets > 0n) expect(result).toBe(MAX_UINT_256);
    }
  });

  test.prop([liquidationPriceCase], { numRuns: 1000 })(
    "behavior: returns a positive price for borrowed positions",
    (input) => {
      const result = MarketUtils.getLiquidationPrice(
        input,
        {
          totalBorrowAssets: input.totalBorrowAssets,
          totalBorrowShares: input.totalBorrowShares,
        },
        { lltv: input.lltv },
      );

      expect(result).not.toBeNull();
      if (result === null) return;

      expect(result).toBeGreaterThan(0n);
    },
  );

  test.prop([liquidationPriceCase, uint128], { numRuns: 1000 })(
    "behavior: is non-decreasing in borrow shares at fixed market",
    (input, delta) => {
      const largerBorrowShares = min(
        input.totalBorrowShares,
        input.borrowShares + delta,
      );
      const result = MarketUtils.getLiquidationPrice(
        input,
        {
          totalBorrowAssets: input.totalBorrowAssets,
          totalBorrowShares: input.totalBorrowShares,
        },
        { lltv: input.lltv },
      );
      const largerResult = MarketUtils.getLiquidationPrice(
        { ...input, borrowShares: largerBorrowShares },
        {
          totalBorrowAssets: input.totalBorrowAssets,
          totalBorrowShares: input.totalBorrowShares,
        },
        { lltv: input.lltv },
      );

      expect(result).not.toBeNull();
      expect(largerResult).not.toBeNull();
      if (result === null || largerResult === null) return;

      expect(largerResult).toBeGreaterThanOrEqual(result);
    },
  );

  test.prop([liquidationPriceCase, uint128], { numRuns: 1000 })(
    "behavior: is non-increasing in collateral",
    (input, delta) => {
      const largerCollateral = min(MAX_UINT_128, input.collateral + delta);
      const result = MarketUtils.getLiquidationPrice(
        input,
        {
          totalBorrowAssets: input.totalBorrowAssets,
          totalBorrowShares: input.totalBorrowShares,
        },
        { lltv: input.lltv },
      );
      const largerResult = MarketUtils.getLiquidationPrice(
        { ...input, collateral: largerCollateral },
        {
          totalBorrowAssets: input.totalBorrowAssets,
          totalBorrowShares: input.totalBorrowShares,
        },
        { lltv: input.lltv },
      );

      expect(result).not.toBeNull();
      expect(largerResult).not.toBeNull();
      if (result === null || largerResult === null) return;

      expect(largerResult).toBeLessThanOrEqual(result);
    },
  );

  test.prop([liquidationPriceCase], { numRuns: 1000 })(
    "behavior: the reference threshold is exact",
    (input) => {
      const debtAssets = toAssetsUp(
        input.borrowShares,
        input.totalBorrowAssets,
        input.totalBorrowShares,
      );
      const thresholdPrice = minCollateralForDebt(
        debtAssets,
        input.collateral,
        input.lltv,
      );
      if (thresholdPrice > MAX_PRICE) return;

      expect(
        isHealthy(
          input.collateral,
          input.borrowShares,
          input.totalBorrowAssets,
          input.totalBorrowShares,
          thresholdPrice,
          input.lltv,
        ),
      ).toBe(true);
      if (thresholdPrice > 1n) {
        expect(
          isHealthy(
            input.collateral,
            input.borrowShares,
            input.totalBorrowAssets,
            input.totalBorrowShares,
            thresholdPrice - 1n,
            input.lltv,
          ),
        ).toBe(false);
      }
    },
  );

  // The SDK rounds LLTV against collateral before applying the oracle price.
  test.fails.prop([liquidationPriceCase], {
    numRuns: 1000,
    examples: [
      [
        {
          totalBorrowAssets: 0n,
          totalBorrowShares: 1n,
          collateral: 1n,
          lltv: 2_941_176_470_588_236n,
          borrowShares: 1n,
        },
      ],
      [
        {
          totalBorrowAssets: 1_000_000_000_000_000_000_000_000n,
          totalBorrowShares: 1_000_000_000_000_000_000_000_000_000_000n,
          collateral: 10_000_000_000_000_000_000_000_000n,
          lltv: 860_000_000_000_000_000n,
          borrowShares: 5_000_000_000_000_000_000_000_000n,
        },
      ],
    ],
  })("behavior: equals the exact oracle-price threshold", (input) => {
    const debtAssets = toAssetsUp(
      input.borrowShares,
      input.totalBorrowAssets,
      input.totalBorrowShares,
    );
    const thresholdPrice = minCollateralForDebt(
      debtAssets,
      input.collateral,
      input.lltv,
    );
    if (thresholdPrice > MAX_PRICE) return;

    expect(
      MarketUtils.getLiquidationPrice(
        input,
        {
          totalBorrowAssets: input.totalBorrowAssets,
          totalBorrowShares: input.totalBorrowShares,
        },
        { lltv: input.lltv },
      ),
    ).toBe(thresholdPrice);
  });
});
