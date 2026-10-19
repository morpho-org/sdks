import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import {
  borrowRateRef,
  INITIAL_RATE_AT_TARGET,
  SECONDS_PER_YEAR,
  WAD,
} from "../__test__/adaptiveCurveIrmReference.js";
import { edgeBiased } from "../__test__/arbitraries.js";
import { blueAccrualRevertsRef } from "../__test__/blueAccrualReference.js";
import {
  accrualPosition,
  vaultInput,
  vaultMarketConfig,
} from "../__test__/fixtures.js";
import { MathLib } from "../math/MathLib.js";
import { AccrualVault } from "./Vault.js";

const MAX_FEE = 500_000000000000000n;
const elapsedArb = edgeBiased(0n, 10n * SECONDS_PER_YEAR);

const amountArb = edgeBiased(0n, MathLib.MAX_UINT_128);
const feeArb = edgeBiased(0n, MAX_FEE);
const decimalsOffsetArb = edgeBiased(0n, 18n);
const forwardAccrualExample = {
  marketAssets: 10n ** 24n,
  totalBorrowAssets: 9n * 10n ** 23n,
  supplyShares: MathLib.MAX_UINT_128,
  lastTotalAssets: 10n ** 24n,
  totalSupply: 10n ** 24n,
  fee: MAX_FEE,
  decimalsOffset: 0n,
  elapsed: SECONDS_PER_YEAR,
};

const marketCaseArb = fc.oneof(
  amountArb.chain((marketAssets) =>
    fc
      .record({
        totalBorrowAssets:
          marketAssets === 0n
            ? fc.constant(0n)
            : fc.oneof(fc.constant(0n), edgeBiased(1n, marketAssets)),
        supplyShares: amountArb,
        lastTotalAssets: amountArb,
        totalSupply: amountArb,
        fee: feeArb,
        decimalsOffset: decimalsOffsetArb,
        elapsed: elapsedArb,
      })
      .map((input) => ({ ...input, marketAssets })),
  ),
  fc
    .oneof(
      fc.constantFrom(10n ** 18n, 2n ** 100n),
      fc.bigInt({ min: 10n ** 18n, max: 2n ** 100n }),
    )
    .chain((marketAssets) =>
      fc
        .record({
          totalBorrowAssets: fc.oneof(
            fc.constantFrom(marketAssets / 2n, marketAssets),
            fc.bigInt({
              min: marketAssets / 2n,
              max: marketAssets,
            }),
          ),
          supplyShares: fc.oneof(
            fc.constantFrom(MathLib.MAX_UINT_128 / 2n, MathLib.MAX_UINT_128),
            fc.bigInt({
              min: MathLib.MAX_UINT_128 / 2n,
              max: MathLib.MAX_UINT_128,
            }),
          ),
          lastTotalAssets: amountArb,
          totalSupply: amountArb,
          fee: feeArb,
          decimalsOffset: decimalsOffsetArb,
          elapsed: edgeBiased(1n, 10n * SECONDS_PER_YEAR),
        })
        .map((input) => ({ ...input, marketAssets })),
    ),
);
const vaultCaseArb = marketCaseArb.chain((input) =>
  edgeBiased(0n, input.lastTotalAssets).map((lostAssets) => ({
    ...input,
    lostAssets,
  })),
);
const vaultV1CaseArb = marketCaseArb;

function accrueVault(input: {
  marketAssets: bigint;
  totalBorrowAssets: bigint;
  supplyShares: bigint;
  lastTotalAssets: bigint;
  totalSupply: bigint;
  fee: bigint;
  decimalsOffset: bigint;
  elapsed: bigint;
  lostAssets?: bigint;
}) {
  const position = accrualPosition(
    { supplyShares: input.supplyShares, borrowShares: 0n },
    {
      totalSupplyAssets: input.marketAssets,
      totalBorrowAssets: input.totalBorrowAssets,
      totalSupplyShares: MathLib.MAX_UINT_128,
      totalBorrowShares: input.totalBorrowAssets,
      lastUpdate: 100n,
      fee: 0n,
      rateAtTarget: INITIAL_RATE_AT_TARGET,
    },
  );
  const market = position.market;
  const utilization =
    market.totalSupplyAssets === 0n
      ? 0n
      : (market.totalBorrowAssets * WAD) / market.totalSupplyAssets;
  const { avgBorrowRate } = borrowRateRef({
    utilization,
    startRateAtTarget: INITIAL_RATE_AT_TARGET,
    elapsed: input.elapsed,
  });
  fc.pre(
    !blueAccrualRevertsRef({
      borrowRate: avgBorrowRate,
      state: {
        totalSupplyAssets: market.totalSupplyAssets,
        totalBorrowAssets: market.totalBorrowAssets,
        totalSupplyShares: market.totalSupplyShares,
        totalBorrowShares: market.totalBorrowShares,
        fee: market.fee,
      },
      elapsed: input.elapsed,
    }),
  );
  const timestamp = position.market.lastUpdate + input.elapsed;
  const realTotalAssets = position.accrueInterest(timestamp).supplyAssets;
  const vault = new AccrualVault(
    vaultInput({
      fee: input.fee,
      totalSupply: input.totalSupply,
      totalAssets: position.supplyAssets,
      lastTotalAssets: input.lastTotalAssets,
      lostAssets: input.lostAssets,
      decimalsOffset: input.decimalsOffset,
      supplyQueue: [position.marketId],
      withdrawQueue: [position.marketId],
    }),
    [{ config: vaultMarketConfig(position.marketId), position }],
  ).accrueInterest(timestamp);

  return { vault, realTotalAssets };
}

// metamorpho-v1.1 src/MetaMorpho.sol _accruedFeeAndAssets, _accrueInterest, _convertToSharesWithTotals
describe("MetaMorpho V1.1 accrueInterest", () => {
  test.prop([vaultCaseArb], {
    numRuns: 1_000,
    examples: [[{ ...forwardAccrualExample, lostAssets: 0n }]],
  })("default", (input) => {
    const { vault, realTotalAssets } = accrueVault(input);
    const newLost =
      realTotalAssets < input.lastTotalAssets - input.lostAssets
        ? input.lastTotalAssets - realTotalAssets
        : input.lostAssets;
    const newTotal = realTotalAssets + newLost;
    const interest = newTotal - input.lastTotalAssets;
    const feeAssets = (interest * input.fee) / WAD;
    const feeShares =
      feeAssets === 0n
        ? 0n
        : (feeAssets * (input.totalSupply + 10n ** input.decimalsOffset)) /
          (newTotal - feeAssets + 1n);

    expect(vault.totalAssets).toBe(newTotal);
    expect(vault.lastTotalAssets).toBe(newTotal);
    expect(vault.lostAssets).toBe(newLost);
    expect(vault.totalSupply).toBe(input.totalSupply + feeShares);
  });

  test.prop([vaultCaseArb], { numRuns: 1_000 })(
    "behavior: zero fee leaves supply unchanged",
    (input) => {
      const { vault } = accrueVault({ ...input, fee: 0n });

      expect(vault.totalSupply).toBe(input.totalSupply);
    },
  );

  test.prop([vaultCaseArb], { numRuns: 1_000 })(
    "behavior: total assets do not decrease",
    (input) => {
      const { vault } = accrueVault(input);

      expect(vault.totalAssets).toBeGreaterThanOrEqual(input.lastTotalAssets);
    },
  );

  test.prop([vaultCaseArb], { numRuns: 1_000 })(
    "behavior: fee-share value does not exceed fee assets",
    (input) => {
      const { vault, realTotalAssets } = accrueVault(input);
      const newLost =
        realTotalAssets < input.lastTotalAssets - input.lostAssets
          ? input.lastTotalAssets - realTotalAssets
          : input.lostAssets;
      const newTotal = realTotalAssets + newLost;
      const interest = newTotal - input.lastTotalAssets;
      const feeAssets = (interest * input.fee) / WAD;
      const feeShares = vault.totalSupply - input.totalSupply;
      const feeValue =
        (feeShares * (newTotal + 1n)) /
        (input.totalSupply + feeShares + 10n ** input.decimalsOffset);

      expect(feeValue).toBeLessThanOrEqual(feeAssets);
    },
  );
});

// metamorpho src/MetaMorpho.sol _accruedFeeShares
describe("MetaMorpho V1 accrueInterest", () => {
  test.prop([vaultV1CaseArb], {
    numRuns: 1_000,
    examples: [[forwardAccrualExample]],
  })("default", (input) => {
    const { vault, realTotalAssets } = accrueVault(input);
    const interest =
      realTotalAssets > input.lastTotalAssets
        ? realTotalAssets - input.lastTotalAssets
        : 0n;
    const feeAssets = (interest * input.fee) / WAD;
    const feeShares =
      feeAssets === 0n
        ? 0n
        : (feeAssets * (input.totalSupply + 10n ** input.decimalsOffset)) /
          (realTotalAssets - feeAssets + 1n);

    expect(vault.totalAssets).toBe(realTotalAssets);
    expect(vault.lastTotalAssets).toBe(realTotalAssets);
    expect(vault.lostAssets).toBeUndefined();
    expect(vault.totalSupply).toBe(input.totalSupply + feeShares);
  });

  test.prop([vaultV1CaseArb], { numRuns: 1_000 })(
    "behavior: zero fee leaves supply unchanged",
    (input) => {
      const { vault } = accrueVault({ ...input, fee: 0n });

      expect(vault.totalSupply).toBe(input.totalSupply);
    },
  );

  test.prop([vaultV1CaseArb], { numRuns: 1_000 })(
    "behavior: fee-share value does not exceed fee assets",
    (input) => {
      const { vault, realTotalAssets } = accrueVault(input);
      const interest =
        realTotalAssets > input.lastTotalAssets
          ? realTotalAssets - input.lastTotalAssets
          : 0n;
      const feeAssets = (interest * input.fee) / WAD;
      const feeShares = vault.totalSupply - input.totalSupply;
      const feeValue =
        (feeShares * (realTotalAssets + 1n)) /
        (input.totalSupply + feeShares + 10n ** input.decimalsOffset);

      expect(feeValue).toBeLessThanOrEqual(feeAssets);
    },
  );
});
