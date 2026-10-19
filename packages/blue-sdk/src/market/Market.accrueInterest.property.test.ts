import { fc, test } from "@fast-check/vitest";
import { ZERO_ADDRESS } from "@morpho-org/morpho-ts";
import { describe, expect } from "vitest";
import {
  borrowRateRef,
  MAX_RATE_AT_TARGET,
  MIN_RATE_AT_TARGET,
  SECONDS_PER_YEAR,
  TARGET_UTILIZATION,
  WAD,
} from "../__test__/adaptiveCurveIrmReference.js";
import { edgeBiased, VIRTUAL_SHARES } from "../__test__/arbitraries.js";
import {
  type AccruedInterestState,
  accruedInterestRef,
  blueAccrualRevertsRef,
  VIRTUAL_ASSETS,
} from "../__test__/blueAccrualReference.js";
import { marketInput, marketParams } from "../__test__/fixtures.js";
import { MathLib } from "../math/MathLib.js";
import { SharesMath } from "../math/SharesMath.js";
import { Market } from "./Market.js";
import { MarketUtils } from "./MarketUtils.js";

const MAX_FEE = 250_000000000000000n;

const assetsArb = edgeBiased(0n, MathLib.MAX_UINT_128);
const sharesArb = fc.oneof(
  { arbitrary: fc.constant(VIRTUAL_SHARES), weight: 1 },
  { arbitrary: edgeBiased(0n, MathLib.MAX_UINT_128), weight: 5 },
);
const feeArb = edgeBiased(0n, MAX_FEE);
const elapsedArb = edgeBiased(0n, 10n * SECONDS_PER_YEAR);
const borrowRateArb = edgeBiased(0n, 4n * MAX_RATE_AT_TARGET);
const rateAtTargetArb = fc.oneof(
  fc.constantFrom(0n, MIN_RATE_AT_TARGET, MAX_RATE_AT_TARGET),
  fc.bigInt({ min: MIN_RATE_AT_TARGET, max: MAX_RATE_AT_TARGET }),
);

const marketStateArb = assetsArb.chain((totalSupplyAssets) =>
  fc
    .record({
      totalBorrowAssets: edgeBiased(0n, totalSupplyAssets),
      totalSupplyShares: sharesArb,
      totalBorrowShares: sharesArb,
      fee: feeArb,
    })
    .map((state) => ({ ...state, totalSupplyAssets })),
);

const accruedInterestCaseArb = fc.record({
  state: marketStateArb,
  borrowRate: borrowRateArb,
  elapsed: elapsedArb,
});
const revertingAccruedInterestCaseArb = accruedInterestCaseArb.filter(
  ({ state, borrowRate, elapsed }) =>
    blueAccrualRevertsRef({ borrowRate, state, elapsed }),
);
const positiveElapsedAccruedInterestCaseArb = fc.record({
  state: marketStateArb,
  borrowRate: borrowRateArb,
  elapsed: edgeBiased(1n, 10n * SECONDS_PER_YEAR),
});
const elapsedInterestCaseArb = fc.record({
  state: marketStateArb,
  borrowRate: borrowRateArb,
  elapsedPair: fc.tuple(elapsedArb, elapsedArb),
});
const marketAccrualCaseArb = fc.record({
  state: marketStateArb,
  rateAtTarget: rateAtTargetArb,
  elapsed: elapsedArb,
});
const marketForwardCaseArb = fc.record({
  state: marketStateArb,
  rateAtTarget: rateAtTargetArb,
  elapsed: edgeBiased(1n, 10n * SECONDS_PER_YEAR),
});
const marketBeforeUpdateCaseArb = fc.record({
  state: marketStateArb,
  rateAtTarget: rateAtTargetArb,
  elapsed: edgeBiased(0n, 100n),
});
const marketAtTargetUtilizationStateArb = edgeBiased(
  1n,
  MathLib.MAX_UINT_128 / 10n,
).chain((multiple) =>
  fc
    .record({
      totalSupplyShares: sharesArb,
      totalBorrowShares: sharesArb,
      fee: feeArb,
    })
    .map((state) => ({
      ...state,
      totalSupplyAssets: 10n * multiple,
      totalBorrowAssets: 9n * multiple,
    })),
);
const nonAdaptingMarketElapsedCaseArb = fc.record({
  state: marketAtTargetUtilizationStateArb,
  rateAtTarget: rateAtTargetArb,
  elapsedPair: fc.tuple(elapsedArb, elapsedArb),
});
const zeroIrmCaseArb = fc.record({
  state: marketStateArb,
  elapsed: edgeBiased(1n, 10n * SECONDS_PER_YEAR),
});

function marketAccrualRef({
  state,
  rateAtTarget,
  elapsed,
}: {
  state: AccruedInterestState;
  rateAtTarget: bigint;
  elapsed: bigint;
}) {
  const utilization =
    state.totalSupplyAssets === 0n
      ? 0n
      : (state.totalBorrowAssets * WAD) / state.totalSupplyAssets;
  const { avgBorrowRate, endRateAtTarget } = borrowRateRef({
    utilization,
    startRateAtTarget: rateAtTarget,
    elapsed,
  });
  const { interest, feeShares } = accruedInterestRef({
    borrowRate: avgBorrowRate,
    state,
    elapsed,
  });

  return {
    avgBorrowRate,
    rateAtTarget: endRateAtTarget,
    totalSupplyAssets: state.totalSupplyAssets + interest,
    totalBorrowAssets: state.totalBorrowAssets + interest,
    totalSupplyShares: state.totalSupplyShares + feeShares,
    totalBorrowShares: state.totalBorrowShares,
  };
}

// morpho-blue src/Morpho.sol _accrueInterest, MathLib.wTaylorCompounded, SharesMathLib.toSharesDown
describe("MarketUtils.getAccruedInterest", () => {
  test.prop([accruedInterestCaseArb], { numRuns: 1_000 })(
    "default",
    ({ state, borrowRate, elapsed }) => {
      fc.pre(!blueAccrualRevertsRef({ borrowRate, state, elapsed }));
      const { interest, feeShares } = accruedInterestRef({
        borrowRate,
        state,
        elapsed,
      });

      expect(
        MarketUtils.getAccruedInterest(borrowRate, state, elapsed),
      ).toStrictEqual({ interest, feeShares });
    },
  );

  test("constants match Solidity", () => {
    expect(MathLib.WAD).toBe(WAD);
    expect(SharesMath.VIRTUAL_SHARES).toBe(VIRTUAL_SHARES);
    expect(SharesMath.VIRTUAL_ASSETS).toBe(VIRTUAL_ASSETS);
  });

  test.prop([marketStateArb, borrowRateArb], { numRuns: 1_000 })(
    "behavior: elapsed 0 accrues nothing",
    (state, borrowRate) => {
      expect(
        MarketUtils.getAccruedInterest(borrowRate, state, 0n),
      ).toStrictEqual({ interest: 0n, feeShares: 0n });
    },
  );

  test.prop([positiveElapsedAccruedInterestCaseArb], { numRuns: 1_000 })(
    "behavior: zero fee mints no fee shares",
    ({ state, borrowRate, elapsed }) => {
      const zeroFeeState = { ...state, fee: 0n };
      fc.pre(
        !blueAccrualRevertsRef({
          borrowRate,
          state: zeroFeeState,
          elapsed,
        }),
      );
      const result = MarketUtils.getAccruedInterest(
        borrowRate,
        zeroFeeState,
        elapsed,
      );
      const expected = accruedInterestRef({
        borrowRate,
        state: zeroFeeState,
        elapsed,
      });

      expect(result.interest).toBe(expected.interest);
      expect(result.feeShares).toBe(0n);
    },
  );

  test.prop([elapsedInterestCaseArb], { numRuns: 1_000 })(
    "behavior: interest is non-decreasing in elapsed time",
    ({ state, borrowRate, elapsedPair }) => {
      const [elapsed1, elapsed2] =
        elapsedPair[0] <= elapsedPair[1]
          ? elapsedPair
          : [elapsedPair[1], elapsedPair[0]];
      fc.pre(!blueAccrualRevertsRef({ borrowRate, state, elapsed: elapsed2 }));
      const first = accruedInterestRef({
        borrowRate,
        state,
        elapsed: elapsed1,
      });
      const second = accruedInterestRef({
        borrowRate,
        state,
        elapsed: elapsed2,
      });

      expect(first.interest).toBeLessThanOrEqual(second.interest);
      expect(
        MarketUtils.getAccruedInterest(borrowRate, state, elapsed1).interest,
      ).toBeLessThanOrEqual(
        MarketUtils.getAccruedInterest(borrowRate, state, elapsed2).interest,
      );
    },
  );

  test.prop([accruedInterestCaseArb], { numRuns: 1_000 })(
    "behavior: fee shares never exceed the fee value",
    ({ state, borrowRate, elapsed }) => {
      fc.pre(!blueAccrualRevertsRef({ borrowRate, state, elapsed }));
      const { interest, feeShares } = MarketUtils.getAccruedInterest(
        borrowRate,
        state,
        elapsed,
      );
      const feeAmount = (interest * state.fee) / WAD;
      const value =
        (feeShares * (state.totalSupplyAssets + interest + VIRTUAL_ASSETS)) /
        (state.totalSupplyShares + feeShares + VIRTUAL_SHARES);

      expect(value).toBeLessThanOrEqual(feeAmount);
    },
  );

  // SDK divergence: accrual doesn't revert past uint256/uint128 like Morpho; drop `.fails` once it does.
  test.fails.prop([revertingAccruedInterestCaseArb], {
    numRuns: 1_000,
    examples: [
      [
        {
          state: {
            totalSupplyAssets: MathLib.MAX_UINT_128,
            totalBorrowAssets: MathLib.MAX_UINT_128,
            totalSupplyShares: MathLib.MAX_UINT_128,
            totalBorrowShares: MathLib.MAX_UINT_128,
            fee: MAX_FEE,
          },
          borrowRate: 4n * MAX_RATE_AT_TARGET,
          elapsed: SECONDS_PER_YEAR,
        },
      ],
    ],
  })(
    "behavior: throws where Morpho reverts",
    ({ state, borrowRate, elapsed }) => {
      expect(() =>
        MarketUtils.getAccruedInterest(borrowRate, state, elapsed),
      ).toThrow();
    },
  );
});

// morpho-blue src/Morpho.sol _accrueInterest
describe("Market.accrueInterest", () => {
  test.prop([marketForwardCaseArb], { numRuns: 1_000 })(
    "default",
    ({ state, rateAtTarget, elapsed }) => {
      const original = new Market(
        marketInput({ ...state, rateAtTarget, lastUpdate: 100n }),
      );
      expect(original.params.irm).not.toBe(ZERO_ADDRESS);
      expect(original.rateAtTarget).toBeDefined();

      const { avgBorrowRate, ...expected } = marketAccrualRef({
        state,
        rateAtTarget,
        elapsed,
      });
      fc.pre(
        !blueAccrualRevertsRef({ borrowRate: avgBorrowRate, state, elapsed }),
      );
      const result = original.accrueInterest(original.lastUpdate + elapsed);

      expect({
        totalSupplyAssets: result.totalSupplyAssets,
        totalBorrowAssets: result.totalBorrowAssets,
        totalSupplyShares: result.totalSupplyShares,
        totalBorrowShares: result.totalBorrowShares,
        lastUpdate: result.lastUpdate,
        rateAtTarget: result.rateAtTarget,
      }).toStrictEqual({
        ...expected,
        lastUpdate: original.lastUpdate + elapsed,
      });
    },
  );

  test.prop([marketBeforeUpdateCaseArb], { numRuns: 1_000 })(
    "behavior: timestamp at or before lastUpdate returns an unchanged copy",
    ({ state, rateAtTarget, elapsed }) => {
      const original = new Market(
        marketInput({ ...state, rateAtTarget, lastUpdate: 100n }),
      );

      expect(
        original.accrueInterest(original.lastUpdate - elapsed),
      ).toStrictEqual(original);
    },
  );

  test.prop([marketAccrualCaseArb], { numRuns: 1_000 })(
    "behavior: totals increase together and liquidity is unchanged",
    ({ state, rateAtTarget, elapsed }) => {
      const { avgBorrowRate } = marketAccrualRef({
        state,
        rateAtTarget,
        elapsed,
      });
      fc.pre(
        !blueAccrualRevertsRef({ borrowRate: avgBorrowRate, state, elapsed }),
      );
      const original = new Market(
        marketInput({ ...state, rateAtTarget, lastUpdate: 100n }),
      );
      const result = original.accrueInterest(original.lastUpdate + elapsed);

      expect(result.totalSupplyAssets).toBeGreaterThanOrEqual(
        original.totalSupplyAssets,
      );
      expect(result.totalBorrowAssets).toBeGreaterThanOrEqual(
        original.totalBorrowAssets,
      );
      expect(result.totalSupplyAssets - result.totalBorrowAssets).toBe(
        original.totalSupplyAssets - original.totalBorrowAssets,
      );
    },
  );

  // With adaptation, floored Adaptive Curve averages can drop totals by a wei-rate step between seconds, as on-chain.
  test.prop([nonAdaptingMarketElapsedCaseArb], { numRuns: 1_000 })(
    "behavior: totals are non-decreasing in elapsed time when the rate can't adapt",
    ({ state, rateAtTarget, elapsedPair }) => {
      expect((state.totalBorrowAssets * WAD) / state.totalSupplyAssets).toBe(
        TARGET_UTILIZATION,
      );
      const [elapsed1, elapsed2] =
        elapsedPair[0] <= elapsedPair[1]
          ? elapsedPair
          : [elapsedPair[1], elapsedPair[0]];
      const expected1 = marketAccrualRef({
        state,
        rateAtTarget,
        elapsed: elapsed1,
      });
      const expected2 = marketAccrualRef({
        state,
        rateAtTarget,
        elapsed: elapsed2,
      });
      fc.pre(
        !blueAccrualRevertsRef({
          borrowRate: expected1.avgBorrowRate,
          state,
          elapsed: elapsed1,
        }),
      );
      fc.pre(
        !blueAccrualRevertsRef({
          borrowRate: expected2.avgBorrowRate,
          state,
          elapsed: elapsed2,
        }),
      );
      const original = new Market(
        marketInput({ ...state, rateAtTarget, lastUpdate: 100n }),
      );
      const first = original.accrueInterest(original.lastUpdate + elapsed1);
      const second = original.accrueInterest(original.lastUpdate + elapsed2);

      expect(expected1.totalBorrowAssets).toBeLessThanOrEqual(
        expected2.totalBorrowAssets,
      );
      expect(expected1.totalSupplyAssets).toBeLessThanOrEqual(
        expected2.totalSupplyAssets,
      );
      expect(first.totalBorrowAssets).toBeLessThanOrEqual(
        second.totalBorrowAssets,
      );
      expect(first.totalSupplyAssets).toBeLessThanOrEqual(
        second.totalSupplyAssets,
      );
    },
  );

  test("behavior: totals can decrease by one second under adaptation, like Morpho", () => {
    const state = {
      totalSupplyAssets: 10n ** 30n,
      totalBorrowAssets: 899999n * 10n ** 24n,
      totalSupplyShares: 10n ** 30n,
      totalBorrowShares: 899999n * 10n ** 24n,
      fee: 0n,
    };
    const rateAtTarget = 100_000_000n;
    const original = new Market(
      marketInput({ ...state, rateAtTarget, lastUpdate: 100n }),
    );
    const elapsed1 = 110_253_955n;
    const elapsed2 = 110_253_956n;
    const expected1 = marketAccrualRef({
      state,
      rateAtTarget,
      elapsed: elapsed1,
    });
    const expected2 = marketAccrualRef({
      state,
      rateAtTarget,
      elapsed: elapsed2,
    });
    const first = original.accrueInterest(original.lastUpdate + elapsed1);
    const second = original.accrueInterest(original.lastUpdate + elapsed2);

    expect((state.totalBorrowAssets * WAD) / state.totalSupplyAssets).toBe(
      899_999_000_000_000_000n,
    );
    expect([
      first.totalSupplyAssets,
      first.totalBorrowAssets,
      first.totalSupplyShares,
      first.totalBorrowShares,
      first.rateAtTarget,
    ]).toStrictEqual([
      expected1.totalSupplyAssets,
      expected1.totalBorrowAssets,
      expected1.totalSupplyShares,
      expected1.totalBorrowShares,
      expected1.rateAtTarget,
    ]);
    expect([
      second.totalSupplyAssets,
      second.totalBorrowAssets,
      second.totalSupplyShares,
      second.totalBorrowShares,
      second.rateAtTarget,
    ]).toStrictEqual([
      expected2.totalSupplyAssets,
      expected2.totalBorrowAssets,
      expected2.totalSupplyShares,
      expected2.totalBorrowShares,
      expected2.rateAtTarget,
    ]);
    expect(second.totalBorrowAssets).toBeLessThan(first.totalBorrowAssets);
  });

  test.prop([marketAccrualCaseArb], { numRuns: 1_000 })(
    "behavior: zero fee leaves supply shares unchanged",
    ({ state, rateAtTarget, elapsed }) => {
      const zeroFeeState = { ...state, fee: 0n };
      const { avgBorrowRate } = marketAccrualRef({
        state: zeroFeeState,
        rateAtTarget,
        elapsed,
      });
      fc.pre(
        !blueAccrualRevertsRef({
          borrowRate: avgBorrowRate,
          state: zeroFeeState,
          elapsed,
        }),
      );
      const original = new Market(
        marketInput({
          ...zeroFeeState,
          rateAtTarget,
          lastUpdate: 100n,
        }),
      );

      expect(
        original.accrueInterest(original.lastUpdate + elapsed)
          .totalSupplyShares,
      ).toBe(original.totalSupplyShares);
    },
  );

  test.prop([zeroIrmCaseArb], { numRuns: 1_000 })(
    "behavior: zero address IRM accrues without interest",
    ({ state, elapsed }) => {
      fc.pre(!blueAccrualRevertsRef({ borrowRate: 0n, state, elapsed }));
      const original = new Market(
        marketInput({
          ...state,
          params: marketParams({ irm: ZERO_ADDRESS }),
          rateAtTarget: undefined,
          lastUpdate: 100n,
        }),
      );
      const result = original.accrueInterest(original.lastUpdate + elapsed);

      expect(result.totalSupplyAssets).toBe(original.totalSupplyAssets);
      expect(result.totalBorrowAssets).toBe(original.totalBorrowAssets);
      expect(result.lastUpdate).toBe(original.lastUpdate + elapsed);
    },
  );
});
