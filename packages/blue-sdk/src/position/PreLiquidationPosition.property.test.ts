import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import { marketInput, marketParams, USER } from "../__test__/fixtures.js";
import {
  ceilDiv,
  collateralValue,
  isHealthy,
  MAX_UINT_128,
  ORACLE_PRICE_SCALE,
  positiveLltv,
  priceArbitrary,
  toAssetsDown,
  toAssetsUp,
  uint128,
  VIRTUAL_ASSETS,
  VIRTUAL_SHARES,
  WAD,
} from "../__test__/morphoModel.js";
import {
  PreLiquidationParams,
  PreLiquidationPosition,
} from "./PreLiquidationPosition.js";

const preLiquidationParamsCase = (maxPreLCF2: bigint) =>
  fc
    .record({
      lltv: positiveLltv,
      preLCF1: fc.bigInt({ min: 0n, max: WAD }),
    })
    .chain(({ lltv, preLCF1 }) => {
      const maxPreLif = (WAD * WAD) / lltv;

      return fc.record({
        lltv: fc.constant(lltv),
        preLltv: fc.bigInt({ min: 0n, max: lltv - 1n }),
        preLCF1: fc.constant(preLCF1),
        preLCF2: fc.bigInt({
          min: preLCF1,
          max:
            preLCF1 + 4n * WAD < maxPreLCF2 ? preLCF1 + 4n * WAD : maxPreLCF2,
        }),
        preLIF1: fc.bigInt({ min: WAD, max: maxPreLif }),
      });
    })
    .chain(({ lltv, preLltv, preLCF1, preLCF2, preLIF1 }) => {
      const maxPreLif = (WAD * WAD) / lltv;

      return fc.record({
        lltv: fc.constant(lltv),
        preLltv: fc.constant(preLltv),
        preLCF1: fc.constant(preLCF1),
        preLCF2: fc.constant(preLCF2),
        preLIF1: fc.constant(preLIF1),
        preLIF2: fc.bigInt({ min: preLIF1, max: maxPreLif }),
      });
    });

const preLiquidationPositionUniformCase = (maxPreLCF2: bigint) =>
  preLiquidationParamsCase(maxPreLCF2)
    .chain((params) =>
      fc.record({
        params: fc.constant(params),
        totalBorrowAssets: uint128,
        totalBorrowShares: uint128,
        collateral: uint128,
        price: priceArbitrary,
        marketPrice: priceArbitrary,
      }),
    )
    .chain((input) =>
      fc.record({
        params: fc.constant(input.params),
        totalBorrowAssets: fc.constant(input.totalBorrowAssets),
        totalBorrowShares: fc.constant(input.totalBorrowShares),
        collateral: fc.constant(input.collateral),
        price: fc.constant(input.price),
        marketPrice: fc.constant(input.marketPrice),
        borrowShares: fc.bigInt({
          min: 0n,
          max: input.totalBorrowShares,
        }),
      }),
    );

const quotient = fc.bigInt({ min: 0n, max: WAD });

// biome-ignore lint/complexity/useMaxParams: The reference follows the protocol formula inputs.
const interpolate = (first: bigint, second: bigint, q: bigint) =>
  first + (q * (second - first)) / WAD;

function createPosition(input: {
  params: {
    lltv: bigint;
    preLltv: bigint;
    preLCF1: bigint;
    preLCF2: bigint;
    preLIF1: bigint;
    preLIF2: bigint;
  };
  totalBorrowAssets: bigint;
  totalBorrowShares: bigint;
  collateral: bigint;
  price: bigint;
  marketPrice: bigint;
  borrowShares: bigint;
}) {
  const { lltv, ...params } = input.params;

  return new PreLiquidationPosition(
    {
      user: USER,
      supplyShares: 0n,
      borrowShares: input.borrowShares,
      collateral: input.collateral,
      preLiquidationParams: {
        ...params,
        preLiquidationOracle: USER,
      },
      preLiquidation: USER,
      preLiquidationOraclePrice: input.price,
    },
    marketInput({
      params: marketParams({ lltv }),
      totalBorrowAssets: input.totalBorrowAssets,
      totalBorrowShares: input.totalBorrowShares,
      price: input.marketPrice,
    }),
  );
}

function preLiquidationReference(input: {
  params: {
    lltv: bigint;
    preLltv: bigint;
    preLCF1: bigint;
    preLCF2: bigint;
    preLIF1: bigint;
    preLIF2: bigint;
  };
  totalBorrowAssets: bigint;
  totalBorrowShares: bigint;
  collateral: bigint;
  price: bigint;
  marketPrice: bigint;
  borrowShares: bigint;
}) {
  const debtAssets = toAssetsUp(
    input.borrowShares,
    input.totalBorrowAssets,
    input.totalBorrowShares,
  );
  const collateralValueInLoanAssets = collateralValue(
    input.collateral,
    input.price,
  );
  const baseMaxBorrow = (collateralValueInLoanAssets * input.params.lltv) / WAD;
  const preMaxBorrow =
    (collateralValueInLoanAssets * input.params.preLltv) / WAD;
  const isLiquidatable =
    debtAssets <= baseMaxBorrow && debtAssets > preMaxBorrow;
  const positionIsHealthy =
    debtAssets > baseMaxBorrow ? undefined : debtAssets <= preMaxBorrow;

  if (!isLiquidatable)
    return {
      isHealthy: positionIsHealthy,
      isLiquidatable,
      quotient: 0n,
      repayableShares: 0n,
      seizedCollateral: 0n,
    };

  const ltv = ceilDiv(debtAssets * WAD, collateralValueInLoanAssets);
  const q =
    ((ltv - input.params.preLltv) * WAD) /
    (input.params.lltv - input.params.preLltv);
  const preLCF = interpolate(input.params.preLCF1, input.params.preLCF2, q);
  const preLIF = interpolate(input.params.preLIF1, input.params.preLIF2, q);
  const uncappedRepayableShares = (input.borrowShares * preLCF) / WAD;
  const repayableShares =
    uncappedRepayableShares < input.borrowShares
      ? uncappedRepayableShares
      : input.borrowShares;
  const repayableAssets =
    (toAssetsDown(
      repayableShares,
      input.totalBorrowAssets,
      input.totalBorrowShares,
    ) *
      preLIF) /
    WAD;

  const uncappedSeizedCollateral =
    (repayableAssets * ORACLE_PRICE_SCALE) / input.price;
  const seizedCollateral =
    uncappedSeizedCollateral < input.collateral
      ? uncappedSeizedCollateral
      : input.collateral;

  return {
    isHealthy: positionIsHealthy,
    isLiquidatable,
    quotient: q,
    repayableShares,
    seizedCollateral,
  };
}

function seizableQuote(input: Parameters<typeof createPosition>[0]) {
  const expected = preLiquidationReference(input);
  return expected.isLiquidatable ? expected.seizedCollateral : 0n;
}

function postRepayIsHealthy(
  input: Parameters<typeof createPosition>[0],
  {
    oraclePrice,
  }: {
    oraclePrice: bigint;
  },
) {
  const expected = preLiquidationReference(input);
  if (!expected.isLiquidatable) return false;

  const repaidAssets = toAssetsUp(
    expected.repayableShares,
    input.totalBorrowAssets,
    input.totalBorrowShares,
  );
  const totalBorrowAssets =
    input.totalBorrowAssets > repaidAssets
      ? input.totalBorrowAssets - repaidAssets
      : 0n;
  const totalBorrowShares = input.totalBorrowShares - expected.repayableShares;

  return isHealthy(
    input.collateral - expected.seizedCollateral,
    input.borrowShares - expected.repayableShares,
    totalBorrowAssets,
    totalBorrowShares,
    oraclePrice,
    input.params.lltv,
  );
}

function isExecutable(input: Parameters<typeof createPosition>[0]) {
  return postRepayIsHealthy(input, {
    oraclePrice: input.marketPrice,
  });
}

// A smaller repayment can still succeed when the market oracle is above the
// PreLiquidation oracle; update this model if the SDK is changed to return a
// partial seizure.
function fullQuoteOrNothingSeizedCollateral(
  input: Parameters<typeof createPosition>[0],
) {
  const quote = seizableQuote(input);

  return isExecutable(input) ? quote : 0n;
}

const preLiquidationPositionBandCase = (maxPreLCF2: bigint) =>
  preLiquidationParamsCase(maxPreLCF2)
    .chain((params) =>
      fc.record({
        params: fc.constant(params),
        totalBorrowAssets: fc.constant(MAX_UINT_128),
        totalBorrowShares: fc.constant(MAX_UINT_128),
        collateral: fc.bigInt({
          min: 10n * WAD,
          max: MAX_UINT_128 / 1_000_000n,
        }),
        price: fc.constant(ORACLE_PRICE_SCALE),
        marketPrice: priceArbitrary,
      }),
    )
    .chain((input) => {
      const collateralQuoted = collateralValue(input.collateral, input.price);
      const minimumDebt = (collateralQuoted * input.params.preLltv) / WAD;
      const maximumDebt = (collateralQuoted * input.params.lltv) / WAD;

      return fc
        .bigInt({
          min: minimumDebt + 1n,
          max: maximumDebt - 1n,
        })
        .map((targetDebt) => ({
          ...input,
          borrowShares: ceilDiv(
            targetDebt * (input.totalBorrowShares + VIRTUAL_SHARES),
            input.totalBorrowAssets + VIRTUAL_ASSETS,
          ),
        }))
        .filter((candidate) => {
          const debtAssets = toAssetsUp(
            candidate.borrowShares,
            candidate.totalBorrowAssets,
            candidate.totalBorrowShares,
          );

          return (
            candidate.borrowShares <= candidate.totalBorrowShares &&
            debtAssets > minimumDebt &&
            debtAssets <= maximumDebt
          );
        });
    });

const preLiquidationPositionCase = (maxPreLCF2: bigint) =>
  fc.oneof(
    {
      weight: 3,
      arbitrary: preLiquidationPositionBandCase(maxPreLCF2),
    },
    {
      weight: 1,
      arbitrary: preLiquidationPositionUniformCase(maxPreLCF2),
    },
  );

const postRepayHealthShrunkCase = {
  params: {
    lltv: 860_000_000_000_000_000n,
    preLltv: 8n,
    preLCF1: 654_120_722_530_923_734n,
    preLCF2: 654_120_722_530_923_741n,
    preLIF1: 1_149_936_957_330_329_244n,
    preLIF2: 1_149_936_957_330_329_245n,
  },
  totalBorrowAssets: MAX_UINT_128,
  totalBorrowShares: MAX_UINT_128,
  collateral: 10n * WAD,
  price: ORACLE_PRICE_SCALE,
  marketPrice: 1n,
  borrowShares: 82n,
};

const postRepayHealthRealisticCase = {
  params: {
    lltv: 860_000_000_000_000_000n,
    preLltv: 832_603_694_978_499_652n,
    preLCF1: 2_001_493_508_968_667n,
    preLCF2: 245_311_807_032_632_372n,
    preLIF1: 1_043_841_336_116_910_229n,
    preLIF2: 1_043_841_336_116_910_229n,
  },
  totalBorrowAssets: 1_000_000_000_000_000_000_000_000n,
  totalBorrowShares: 1_000_000_000_000_000_000_000_000_000_000n,
  collateral: 1_000_000_000_000_000_000_000_000n,
  price: ORACLE_PRICE_SCALE,
  marketPrice: (95n * ORACLE_PRICE_SCALE) / 100n,
  borrowShares: 859_999_999_999_999_999_999_999_000_000n,
};

const sdk1397ShrunkCase = {
  params: {
    lltv: 1n,
    preLltv: 0n,
    preLCF1: 689_321_326_096_810_664n,
    preLCF2: 4_689_321_326_096_810_658n,
    preLIF1: 914_080_329_187_335_282_910_585_870_025_770_045n,
    preLIF2: 916_627_422_608_884_444_878_875_505_898_720_539n,
  },
  totalBorrowAssets: 2n,
  totalBorrowShares: 1_000_000n,
  collateral: MAX_UINT_128,
  price: 340_282_366_920_938_463_463_374_607_431_768_211_456n,
  marketPrice: 1n,
  borrowShares: 142_168n,
};

const sdk1397RealisticCase = {
  params: {
    lltv: 860_000_000_000_000_000n,
    preLltv: 800_000_000_000_000_000n,
    preLCF1: 500_000_000_000_000_000n,
    preLCF2: 2n * WAD,
    preLIF1: WAD,
    preLIF2: 1_100_000_000_000_000_000n,
  },
  totalBorrowAssets: 1_000_000_000_000_000_000_000_000n,
  totalBorrowShares: 1_000_000_000_000_000_000_000_000_000_000n,
  collateral: 10_000_000_000_000_000_000_000_000n,
  price: 1_000_000_000_000_000_000_000_000_000_000n,
  marketPrice: 2_000_000_000_000_000_000_000_000_000_001n,
  borrowShares: 8_300_000_000_000_000_000_000_000n,
};

// pre-liquidation src/PreLiquidation.sol
describe("PreLiquidationParams.getCloseFactor", () => {
  test.prop([preLiquidationParamsCase(5n * WAD), quotient], { numRuns: 1000 })(
    "default",
    (params, q) => {
      const instance = new PreLiquidationParams({
        ...params,
        preLiquidationOracle: USER,
      });

      expect(instance.getCloseFactor(q)).toBe(
        interpolate(params.preLCF1, params.preLCF2, q),
      );
    },
  );

  test.prop(
    [preLiquidationParamsCase(5n * WAD), fc.tuple(quotient, quotient)],
    { numRuns: 1000 },
  )(
    "behavior: stays within bounds and is non-decreasing in the quotient",
    (params, [first, second]) => {
      const instance = new PreLiquidationParams({
        ...params,
        preLiquidationOracle: USER,
      });
      const lower = first < second ? first : second;
      const higher = first < second ? second : first;
      const lowerValue = instance.getCloseFactor(lower);
      const higherValue = instance.getCloseFactor(higher);

      expect(lowerValue).toBeGreaterThanOrEqual(params.preLCF1);
      expect(higherValue).toBeLessThanOrEqual(params.preLCF2);
      expect(lowerValue).toBeLessThanOrEqual(higherValue);
      expect(instance.getCloseFactor(0n)).toBe(params.preLCF1);
      expect(instance.getCloseFactor(WAD)).toBe(params.preLCF2);
    },
  );
});

// pre-liquidation src/PreLiquidation.sol
describe("PreLiquidationParams.getIncentiveFactor", () => {
  test.prop([preLiquidationParamsCase(5n * WAD), quotient], { numRuns: 1000 })(
    "default",
    (params, q) => {
      const instance = new PreLiquidationParams({
        ...params,
        preLiquidationOracle: USER,
      });

      expect(instance.getIncentiveFactor(q)).toBe(
        interpolate(params.preLIF1, params.preLIF2, q),
      );
    },
  );

  test.prop(
    [preLiquidationParamsCase(5n * WAD), fc.tuple(quotient, quotient)],
    { numRuns: 1000 },
  )(
    "behavior: stays within bounds and is non-decreasing in the quotient",
    (params, [first, second]) => {
      const instance = new PreLiquidationParams({
        ...params,
        preLiquidationOracle: USER,
      });
      const lower = first < second ? first : second;
      const higher = first < second ? second : first;
      const lowerValue = instance.getIncentiveFactor(lower);
      const higherValue = instance.getIncentiveFactor(higher);

      expect(lowerValue).toBeGreaterThanOrEqual(params.preLIF1);
      expect(higherValue).toBeLessThanOrEqual(params.preLIF2);
      expect(lowerValue).toBeLessThanOrEqual(higherValue);
      expect(instance.getIncentiveFactor(0n)).toBe(params.preLIF1);
      expect(instance.getIncentiveFactor(WAD)).toBe(params.preLIF2);
    },
  );
});

// pre-liquidation src/PreLiquidation.sol
describe("PreLiquidationPosition.isLiquidatable", () => {
  test.prop([preLiquidationPositionCase(5n * WAD)], { numRuns: 1000 })(
    "default",
    (input) => {
      const expected = preLiquidationReference(input);

      expect(createPosition(input).isLiquidatable).toBe(
        expected.isLiquidatable,
      );
    },
  );
});

// pre-liquidation src/PreLiquidation.sol
describe("PreLiquidationPosition.isHealthy", () => {
  test.prop([preLiquidationPositionCase(5n * WAD)], { numRuns: 1000 })(
    "default",
    (input) => {
      const expected = preLiquidationReference(input);

      expect(createPosition(input).isHealthy).toBe(expected.isHealthy);
    },
  );
});

// pre-liquidation src/PreLiquidation.sol _preLiquidate
describe("PreLiquidationPosition.seizableCollateral", () => {
  test.prop([preLiquidationPositionCase(WAD)], { numRuns: 1000 })(
    "default",
    (input) => {
      const expected = preLiquidationReference(input);
      const quote = seizableQuote(input);
      fc.pre(!expected.isLiquidatable || isExecutable(input));
      const actualSeizableCollateral =
        createPosition(input).seizableCollateral!;

      if (expected.isLiquidatable) {
        expect(expected.quotient).toBeGreaterThanOrEqual(0n);
        expect(expected.quotient).toBeLessThanOrEqual(WAD);
      } else {
        expect(actualSeizableCollateral).toBe(0n);
      }

      expect(actualSeizableCollateral).toBe(quote);
      expect(actualSeizableCollateral).toBeLessThanOrEqual(input.collateral);
    },
  );

  // The SDK does not cap repayable shares to the borrower's shares above a 100% close factor.
  test.fails.prop([preLiquidationPositionCase(5n * WAD)], {
    numRuns: 1000,
    examples: [[sdk1397ShrunkCase], [sdk1397RealisticCase]],
  })(
    "behavior: equals the collateral one preLiquidate call can seize",
    (input) => {
      const expected = preLiquidationReference(input);
      const quote = seizableQuote(input);
      fc.pre(!expected.isLiquidatable || isExecutable(input));
      const actualSeizableCollateral =
        createPosition(input).seizableCollateral!;

      expect(actualSeizableCollateral).toBe(quote);
    },
  );

  // The SDK quotes seizures that revert in withdrawCollateral when market-oracle post-repay health fails.
  test.fails.prop([preLiquidationPositionCase(WAD)], {
    numRuns: 1000,
    examples: [[postRepayHealthShrunkCase], [postRepayHealthRealisticCase]],
  })(
    "behavior: seizable collateral is the full quote when it passes the post-repay health check, else zero",
    (input) => {
      const expected = fullQuoteOrNothingSeizedCollateral(input);
      const actualSeizableCollateral =
        createPosition(input).seizableCollateral!;

      expect(actualSeizableCollateral).toBe(expected);
    },
  );

  test("behavior: post-repay health uses the market oracle", () => {
    expect(
      postRepayIsHealthy(postRepayHealthRealisticCase, {
        oraclePrice: postRepayHealthRealisticCase.marketPrice,
      }),
    ).toBe(false);
    expect(
      postRepayIsHealthy(postRepayHealthRealisticCase, {
        oraclePrice: postRepayHealthRealisticCase.price,
      }),
    ).toBe(true);
  });
});
