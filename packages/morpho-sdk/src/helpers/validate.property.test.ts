import { fc, test } from "@fast-check/vitest";
import {
  type AccrualPosition,
  type MarketId,
  MathLib,
  ORACLE_PRICE_SCALE,
} from "@morpho-org/blue-sdk";
import { describe, expect } from "vitest";
import { UINT128_MAX } from "../../test/fixtures/properties.js";
import {
  BorrowExceedsSafeLtvError,
  WithdrawExceedsCollateralError,
  WithdrawMakesPositionUnhealthyError,
} from "../types/index.js";
import { DEFAULT_LLTV_BUFFER } from "./constant.js";
import {
  validatePositionHealth,
  validatePositionHealthAfterWithdraw,
} from "./validate.js";

const marketId = `0x${"11".repeat(32)}` as MarketId;
const amount = fc.oneof(
  fc.constantFrom(0n, 1n, UINT128_MAX),
  fc.bigInt({ min: 0n, max: UINT128_MAX }),
);
const price = fc.oneof(
  fc.constantFrom(1n, ORACLE_PRICE_SCALE),
  fc.bigInt({ min: 1n, max: ORACLE_PRICE_SCALE * 10n ** 12n }),
);
const lltv = fc.oneof(
  fc.constantFrom(0n, DEFAULT_LLTV_BUFFER, MathLib.WAD - 1n),
  fc.bigInt({ min: 0n, max: MathLib.WAD - 1n }),
);

// morpho-blue Morpho.sol _isHealthy: maxBorrow = collateral.mulDivDown(price, ORACLE_PRICE_SCALE)
// .wMulDown(lltv) and borrowed = borrowShares.toAssetsUp(...) <= maxBorrow.
const maxBorrow = (
  collateral: bigint,
  { oraclePrice, ltv }: { oraclePrice: bigint; ltv: bigint },
) => (((collateral * oraclePrice) / ORACLE_PRICE_SCALE) * ltv) / MathLib.WAD;
// morpho-blue SharesMathLib.sol: VIRTUAL_SHARES = 1e6, VIRTUAL_ASSETS = 1.
const VIRTUAL_SHARES = 10n ** 6n;
const toAssetsUp = (
  shares: bigint,
  { assets, supply }: { assets: bigint; supply: bigint },
) => MathLib.mulDivUp(shares, assets + 1n, supply + VIRTUAL_SHARES);
const toSharesUp = (
  assets: bigint,
  { totalAssets, supply }: { totalAssets: bigint; supply: bigint },
) => MathLib.mulDivUp(assets, supply + VIRTUAL_SHARES, totalAssets + 1n);
// Borrow market totals. A borrow share is worth at most one asset (`totalBorrowAssets + 1 <=
// totalBorrowShares + VIRTUAL_SHARES`): shares start at 1e6 per asset, so passing one asset per
// share takes 1e6x interest growth.
const borrowMarket = fc
  .record({
    totalBorrowShares: fc.oneof(
      fc.constantFrom(0n, 1n, VIRTUAL_SHARES, UINT128_MAX),
      fc.bigInt({ min: 0n, max: UINT128_MAX }),
    ),
    assetsRaw: fc.bigInt({ min: 0n, max: UINT128_MAX }),
    sharesRaw: fc.bigInt({ min: 0n, max: UINT128_MAX }),
    pricedAtOne: fc.boolean(),
  })
  .map(({ totalBorrowShares, assetsRaw, sharesRaw, pricedAtOne }) => {
    const assetsCap = totalBorrowShares + VIRTUAL_SHARES - 1n;
    const totalBorrowAssets = pricedAtOne
      ? assetsCap
      : assetsRaw % (assetsCap + 1n);
    const borrowShares = sharesRaw % (totalBorrowShares + 1n);
    return {
      totalBorrowAssets,
      totalBorrowShares,
      borrowShares,
      borrowAssets: toAssetsUp(borrowShares, {
        assets: totalBorrowAssets,
        supply: totalBorrowShares,
      }),
    };
  });
const position = (
  collateral: bigint,
  { borrowAssets, oraclePrice }: { borrowAssets: bigint; oraclePrice: bigint },
) =>
  ({
    marketId,
    collateral,
    borrowAssets,
    market: { price: oraclePrice },
  }) as unknown as AccrualPosition;

// The SDK checks borrowAssets + borrowAmount + 1 against lltv - DEFAULT_LLTV_BUFFER. Morpho.sol
// borrow mints toSharesUp(assets) and _isHealthy prices the new shares with toAssetsUp, so every
// accepted borrow must stay within that +1 allowance and be healthy at the market LLTV.
describe("validatePositionHealth", () => {
  test.prop(
    [
      fc.record({
        collateral: amount,
        extraCollateral: amount,
        market: borrowMarket,
        borrowRaw: amount,
        boundaryDelta: fc.constantFrom(null, -1n, 0n, 1n),
        oraclePrice: price,
        marketLltv: lltv,
      }),
    ],
    { numRuns: 1_000 },
  )(
    "behavior: accepts exactly the buffered bound, and accepted borrows are healthy on-chain",
    ({
      collateral,
      extraCollateral,
      market,
      borrowRaw,
      boundaryDelta,
      oraclePrice,
      marketLltv,
    }) => {
      const { borrowAssets } = market;
      const totalCollateral = collateral + extraCollateral;
      const bufferedLltv = MathLib.zeroFloorSub(
        marketLltv,
        DEFAULT_LLTV_BUFFER,
      );
      // Boundary arm: the largest accepted borrow, plus delta in {-1, 0, 1}.
      const borrowAmount =
        boundaryDelta == null
          ? borrowRaw
          : MathLib.max(
              1n,
              MathLib.zeroFloorSub(
                maxBorrow(totalCollateral, { oraclePrice, ltv: bufferedLltv }),
                borrowAssets + 1n,
              ) + boundaryDelta,
            );
      const borrowedAfter = borrowAssets + borrowAmount + 1n;
      const accepts =
        borrowedAfter <=
        maxBorrow(totalCollateral, { oraclePrice, ltv: bufferedLltv });
      const run = () =>
        validatePositionHealth({
          positionData: position(collateral, { borrowAssets, oraclePrice }),
          additionalCollateral: extraCollateral,
          borrowAmount,
          marketId,
          lltv: marketLltv,
        });
      if (accepts) {
        expect(run).not.toThrow();
        const minted = toSharesUp(borrowAmount, {
          totalAssets: market.totalBorrowAssets,
          supply: market.totalBorrowShares,
        });
        const debt = toAssetsUp(market.borrowShares + minted, {
          assets: market.totalBorrowAssets + borrowAmount,
          supply: market.totalBorrowShares + minted,
        });
        expect(debt).toBeLessThanOrEqual(borrowedAfter);
        expect(debt).toBeLessThanOrEqual(
          maxBorrow(totalCollateral, { oraclePrice, ltv: marketLltv }),
        );
      } else {
        expect(run).toThrow(BorrowExceedsSafeLtvError);
      }
    },
  );
});

// Same Morpho.sol _isHealthy check, on the collateral left after a withdrawal. The debt is the
// position's toAssetsUp(borrowShares) and a withdrawal leaves it unchanged, so accepting at
// lltv - DEFAULT_LLTV_BUFFER implies health at the market LLTV; the property pins the exact bound.
describe("validatePositionHealthAfterWithdraw", () => {
  test.prop(
    [
      fc.record({
        collateral: amount,
        withdrawRaw: amount,
        atBoundary: fc.boolean(),
        boundaryDelta: fc.constantFrom(0n, 1n),
        market: borrowMarket,
        oraclePrice: price,
        marketLltv: lltv,
      }),
    ],
    { numRuns: 1_000 },
  )(
    "behavior: accepts exactly the buffered bound",
    ({
      collateral: collateralRaw,
      withdrawRaw,
      atBoundary,
      boundaryDelta,
      market,
      oraclePrice,
      marketLltv,
    }) => {
      const { borrowAssets } = market;
      const bufferedLltv = MathLib.zeroFloorSub(
        marketLltv,
        DEFAULT_LLTV_BUFFER,
      );
      // Smallest collateral left whose buffered max borrow covers the debt:
      // floor(floor(left * price / 1e36) * ltv / WAD) >= debt.
      const minLeft =
        atBoundary && borrowAssets > 0n && bufferedLltv > 0n && oraclePrice > 0n
          ? MathLib.mulDivUp(
              MathLib.mulDivUp(borrowAssets, MathLib.WAD, bufferedLltv),
              ORACLE_PRICE_SCALE,
              oraclePrice,
            )
          : null;
      if (minLeft != null) {
        const ltv = bufferedLltv;
        expect(maxBorrow(minLeft, { oraclePrice, ltv })).toBeGreaterThanOrEqual(
          borrowAssets,
        );
        expect(maxBorrow(minLeft - 1n, { oraclePrice, ltv })).toBeLessThan(
          borrowAssets,
        );
      }
      // Boundary arm: withdraw down to minLeft (accepted) or one more (rejected).
      const collateral =
        minLeft == null ? collateralRaw : minLeft + collateralRaw;
      const withdrawAmount =
        minLeft == null
          ? withdrawRaw % (collateral + 1n)
          : collateral - minLeft + boundaryDelta;
      const left = collateral - withdrawAmount;
      const accepts =
        borrowAssets === 0n ||
        borrowAssets <= maxBorrow(left, { oraclePrice, ltv: bufferedLltv });
      const run = () =>
        validatePositionHealthAfterWithdraw({
          positionData: position(collateral, { borrowAssets, oraclePrice }),
          withdrawAmount,
          lltv: marketLltv,
          marketId,
        });
      if (accepts) {
        expect(run).not.toThrow();
      } else {
        expect(run).toThrow(WithdrawMakesPositionUnhealthyError);
      }
      expect(() =>
        validatePositionHealthAfterWithdraw({
          positionData: position(collateral, { borrowAssets, oraclePrice }),
          withdrawAmount: collateral + 1n,
          lltv: marketLltv,
          marketId,
        }),
      ).toThrow(WithdrawExceedsCollateralError);
    },
  );
});
