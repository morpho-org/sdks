import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { formatEther } from "viem";
import {
  LIQUIDATION_CURSOR,
  MAX_LIQUIDATION_INCENTIVE_FACTOR,
  ORACLE_PRICE_SCALE,
  SECONDS_PER_YEAR,
} from "../constants.js";
import { MathLib, type RoundingDirection, SharesMath } from "../math/index.js";
import type { BigIntish, MarketId } from "../types.js";
import type { IMarketParams } from "./MarketParams.js";

/**
 * Namespace of utility functions to ease market-related calculations.
 */
export namespace MarketUtils {
  /**
   * Returns the id of a market based on its params.
   * @param market The market params.
   * @returns The deterministic Morpho Blue market id.
   * @example
   * ```ts
   * import { MarketUtils } from "@morpho-org/blue-sdk";
   *
   * const marketParams = {
   *   loanToken: "0x0000000000000000000000000000000000000001",
   *   collateralToken: "0x0000000000000000000000000000000000000002",
   *   oracle: "0x0000000000000000000000000000000000000003",
   *   irm: "0x0000000000000000000000000000000000000004",
   *   lltv: 860_000_000_000_000_000n,
   * } as const;
   *
   * const id = MarketUtils.getMarketId(marketParams);
   * // id satisfies MarketId
   * ```
   */
  export function getMarketId(market: IMarketParams) {
    return `0x${bytesToHex(
      keccak_256(
        hexToBytes(
          `${
            market.loanToken.substring(2).toLowerCase().padStart(64, "0") +
            market.collateralToken
              .substring(2)
              .toLowerCase()
              .padStart(64, "0") +
            market.oracle.substring(2).padStart(64, "0") +
            market.irm.substring(2).toLowerCase().padStart(64, "0") +
            BigInt(market.lltv).toString(16).padStart(64, "0")
          }`,
        ),
      ),
    )}` as MarketId;
  }

  /**
   * Returns the liquidation incentive factor for a given market params.
   * @param config The market params.
   * @returns The liquidation incentive factor, scaled by WAD.
   * @example
   * ```ts
   * import { MarketUtils } from "@morpho-org/blue-sdk";
   *
   * const lif = MarketUtils.getLiquidationIncentiveFactor({ lltv: 86_0000000000000000n });
   * // lif satisfies bigint
   * ```
   */
  export function getLiquidationIncentiveFactor({ lltv }: { lltv: BigIntish }) {
    return MathLib.min(
      MAX_LIQUIDATION_INCENTIVE_FACTOR,
      MathLib.wDivDown(
        MathLib.WAD,
        MathLib.WAD -
          MathLib.wMulDown(LIQUIDATION_CURSOR, MathLib.WAD - BigInt(lltv)),
      ),
    );
  }

  /**
   * Returns the market's utilization rate (scaled by WAD).
   * @param market The market state.
   * @returns The market utilization rate, scaled by WAD.
   * @example
   * ```ts
   * import { MarketUtils } from "@morpho-org/blue-sdk";
   *
   * const utilization = MarketUtils.getUtilization({
   *   totalSupplyAssets: 100n,
   *   totalBorrowAssets: 50n,
   * });
   * // utilization === 500000000000000000n
   * ```
   */
  export function getUtilization({
    totalSupplyAssets,
    totalBorrowAssets,
  }: {
    totalSupplyAssets: BigIntish;
    totalBorrowAssets: BigIntish;
  }) {
    totalSupplyAssets = BigInt(totalSupplyAssets);
    totalBorrowAssets = BigInt(totalBorrowAssets);

    if (totalSupplyAssets === 0n) {
      if (totalBorrowAssets > 0n) return MathLib.MAX_UINT_256;

      return 0n;
    }

    return MathLib.wDivDown(totalBorrowAssets, totalSupplyAssets);
  }

  /**
   * Returns the per-second rate continuously compounded over a year,
   * as calculated in Morpho Blue assuming the market is frequently accrued onchain.
   * @param rate The per-second rate to compound annually.
   * @returns The annual percentage yield as a JavaScript number.
   * @example
   * ```ts
   * import { MarketUtils } from "@morpho-org/blue-sdk";
   *
   * const apy = MarketUtils.rateToApy(1n);
   * // apy satisfies number
   * ```
   */
  export function rateToApy(rate: BigIntish) {
    return Math.expm1(+formatEther(BigInt(rate) * SECONDS_PER_YEAR));
  }

  /**
   * Returns the interest accrued on both sides of the given market
   * as well as the supply shares minted to the fee recipient.
   *
   * Fee shares are converted from the fee amount against post-interest supply assets minus the fee amount,
   * matching Morpho Blue's onchain accrual.
   *
   * @param borrowRate The average borrow rate since the last market update (scaled by WAD).
   * @param market.totalSupplyAssets The market's total supplied assets before accrual.
   * @param market.totalBorrowAssets The market's total borrowed assets before accrual.
   * @param market.totalSupplyShares The market's total supply shares before fee shares are minted.
   * @param market.fee The market fee percentage, scaled by WAD.
   * @param elapsed The time elapsed since the last market update (in seconds).
   * @returns The accrued interest and the supply shares minted to the fee recipient.
   * @example
   * ```ts
   * import { MarketUtils, MathLib } from "@morpho-org/blue-sdk";
   *
   * const { interest, feeShares } = MarketUtils.getAccruedInterest(
   *   5_0000000000000000n,
   *   {
   *     totalSupplyAssets: 1_000_000n * MathLib.WAD,
   *     totalBorrowAssets: 800_000n * MathLib.WAD,
   *     totalSupplyShares: 1_100_000n * MathLib.WAD,
   *     fee: 10_0000000000000000n,
   *   },
   *   1n,
   * );
   * // { interest, feeShares } satisfies { interest: bigint; feeShares: bigint }
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function getAccruedInterest(
    borrowRate: BigIntish,
    market: {
      totalSupplyAssets: BigIntish;
      totalBorrowAssets: BigIntish;
      totalSupplyShares: BigIntish;
      fee: BigIntish;
    },
    elapsed = 0n,
  ) {
    const { totalSupplyAssets, totalBorrowAssets, totalSupplyShares, fee } =
      market;

    const interest = MathLib.wMulDown(
      totalBorrowAssets,
      MathLib.wTaylorCompounded(borrowRate, elapsed),
    );

    const feeAmount = MathLib.wMulDown(interest, fee);
    const feeShares = toSupplyShares(
      feeAmount,
      {
        totalSupplyAssets: BigInt(totalSupplyAssets) + interest - feeAmount,
        totalSupplyShares,
      },
      "Down",
    );

    return { interest, feeShares };
  }

  /**
   * Returns the smallest volume to supply until the market gets the closest to the given utilization rate.
   * @param market The market state.
   * @param utilization The target utilization rate (scaled by WAD).
   * @returns The amount to supply to approach the target utilization.
   * @example
   * ```ts
   * import { MarketUtils, MathLib } from "@morpho-org/blue-sdk";
   *
   * const assets = MarketUtils.getSupplyToUtilization(
   *   { totalSupplyAssets: 100n, totalBorrowAssets: 80n },
   *   MathLib.WAD / 2n,
   * );
   * // assets satisfies bigint
   * ```
   */
  export function getSupplyToUtilization(
    market: {
      totalSupplyAssets: BigIntish;
      totalBorrowAssets: BigIntish;
    },
    utilization: BigIntish,
  ) {
    // biome-ignore lint/style/noParameterAssign: TODO refactor to avoid mutating parameter
    utilization = BigInt(utilization);
    if (utilization === 0n) {
      if (getUtilization(market) === 0n) return 0n;

      return MathLib.MAX_UINT_256;
    }

    return MathLib.zeroFloorSub(
      MathLib.wDivUp(market.totalBorrowAssets, utilization),
      market.totalSupplyAssets,
    );
  }

  /**
   * Returns the liquidity available to withdraw until the market gets the closest to the given utilization rate.
   * @param market The market state.
   * @param utilization The target utilization rate (scaled by WAD).
   * @returns The amount withdrawable before reaching the target utilization.
   * @example
   * ```ts
   * import { MarketUtils, MathLib } from "@morpho-org/blue-sdk";
   *
   * const assets = MarketUtils.getWithdrawToUtilization(
   *   { totalSupplyAssets: 100n, totalBorrowAssets: 50n },
   *   MathLib.WAD,
   * );
   * // assets satisfies bigint
   * ```
   */
  export function getWithdrawToUtilization(
    {
      totalSupplyAssets,
      totalBorrowAssets,
    }: {
      totalSupplyAssets: BigIntish;
      totalBorrowAssets: BigIntish;
    },
    utilization: BigIntish,
  ) {
    // biome-ignore lint/style/noParameterAssign: TODO refactor to avoid mutating parameter
    utilization = BigInt(utilization);
    totalSupplyAssets = BigInt(totalSupplyAssets);
    totalBorrowAssets = BigInt(totalBorrowAssets);
    if (utilization === 0n) {
      if (totalBorrowAssets === 0n) return totalSupplyAssets;

      return 0n;
    }

    return MathLib.zeroFloorSub(
      totalSupplyAssets,
      MathLib.wDivUp(totalBorrowAssets, utilization),
    );
  }

  /**
   * Returns the liquidity available to borrow until the market gets the closest to the given utilization rate.
   * @param market The market state.
   * @param utilization The target utilization rate (scaled by WAD).
   * @returns The amount borrowable before reaching the target utilization.
   * @example
   * ```ts
   * import { MarketUtils, MathLib } from "@morpho-org/blue-sdk";
   *
   * const assets = MarketUtils.getBorrowToUtilization(
   *   { totalSupplyAssets: 100n, totalBorrowAssets: 50n },
   *   MathLib.WAD,
   * );
   * // assets satisfies bigint
   * ```
   */
  export function getBorrowToUtilization(
    {
      totalSupplyAssets,
      totalBorrowAssets,
    }: {
      totalSupplyAssets: BigIntish;
      totalBorrowAssets: BigIntish;
    },
    utilization: BigIntish,
  ) {
    return MathLib.zeroFloorSub(
      MathLib.wMulDown(totalSupplyAssets, utilization),
      totalBorrowAssets,
    );
  }

  /**
   * Returns the smallest volume to repay until the market gets the closest to the given utilization rate.
   * @param market The market state.
   * @param utilization The target utilization rate (scaled by WAD).
   * @returns The amount to repay before reaching the target utilization.
   * @example
   * ```ts
   * import { MarketUtils, MathLib } from "@morpho-org/blue-sdk";
   *
   * const assets = MarketUtils.getRepayToUtilization(
   *   { totalSupplyAssets: 100n, totalBorrowAssets: 80n },
   *   MathLib.WAD / 2n,
   * );
   * // assets satisfies bigint
   * ```
   */
  export function getRepayToUtilization(
    {
      totalSupplyAssets,
      totalBorrowAssets,
    }: {
      totalSupplyAssets: BigIntish;
      totalBorrowAssets: BigIntish;
    },
    utilization: BigIntish,
  ) {
    return MathLib.zeroFloorSub(
      totalBorrowAssets,
      MathLib.wMulDown(totalSupplyAssets, utilization),
    );
  }

  /**
   * Returns the borrow power of a collateral amount before oracle pricing.
   *
   * @param collateral - The collateral amount.
   * @param marketParams.lltv - The market liquidation loan-to-value, scaled by WAD.
   * @returns The collateral amount multiplied by LLTV.
   * @example
   * ```ts
   * import { MarketUtils } from "@morpho-org/blue-sdk";
   *
   * const power = MarketUtils.getCollateralPower(100n, { lltv: 50_0000000000000000n });
   * // power === 50n
   * ```
   */
  export function getCollateralPower(
    collateral: BigIntish,
    { lltv }: { lltv: BigIntish },
  ) {
    return MathLib.wMulDown(collateral, lltv);
  }

  /**
   * Returns the value of a given amount of collateral quoted in loan assets.
   * Return `undefined` iff the market's price is undefined.
   *
   * @param collateral - The collateral amount.
   * @param market.price - The oracle price, scaled by `ORACLE_PRICE_SCALE`.
   * @returns The collateral value in loan assets, or `undefined` when price is unavailable.
   * @example
   * ```ts
   * import { MarketUtils, ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";
   *
   * const value = MarketUtils.getCollateralValue(2n, { price: ORACLE_PRICE_SCALE });
   * // value === 2n
   * ```
   */
  export function getCollateralValue(
    collateral: BigIntish,
    { price }: { price?: BigIntish },
  ) {
    if (price == null) return;

    return MathLib.mulDivDown(collateral, price, ORACLE_PRICE_SCALE);
  }

  /**
   * Returns the maximum debt allowed given a certain amount of collateral.
   * Return `undefined` iff the market's price is undefined.
   * To calculate the amount of loan assets that can be borrowed, use `getMaxBorrowableAssets`.
   *
   * @param collateral - The collateral amount.
   * @param market.price - The oracle price, scaled by `ORACLE_PRICE_SCALE`.
   * @param marketParams.lltv - The market liquidation loan-to-value, scaled by WAD.
   * @returns The maximum borrow assets allowed, or `undefined` when price is unavailable.
   * @example
   * ```ts
   * import { MarketUtils, ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";
   *
   * const maxBorrow = MarketUtils.getMaxBorrowAssets(
   *   2n,
   *   { price: ORACLE_PRICE_SCALE },
   *   { lltv: 50_0000000000000000n },
   * );
   * // maxBorrow === 1n
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function getMaxBorrowAssets(
    collateral: BigIntish,
    market: { price?: BigIntish },
    { lltv }: { lltv: BigIntish },
  ) {
    const collateralValue = getCollateralValue(collateral, market);
    if (collateralValue == null) return;

    return MathLib.wMulDown(collateralValue, lltv);
  }

  /**
   * Returns the maximum amount of loan assets that can be borrowed given a certain borrow position.
   * Return `undefined` iff the market's price is undefined.
   *
   * @param position.collateral - The collateral amount in the position.
   * @param position.borrowShares - The borrow shares in the position.
   * @param market.totalBorrowAssets - The market's total borrowed assets.
   * @param market.totalBorrowShares - The market's total borrow shares.
   * @param market.price - The oracle price, scaled by `ORACLE_PRICE_SCALE`.
   * @param marketParams.lltv - The market liquidation loan-to-value, scaled by WAD.
   * @returns The additional borrowable loan assets, or `undefined` when price is unavailable.
   * @example
   * ```ts
   * import { MarketUtils, ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";
   *
   * const borrowable = MarketUtils.getMaxBorrowableAssets(
   *   { collateral: 2n, borrowShares: 0n },
   *   { totalBorrowAssets: 0n, totalBorrowShares: 0n, price: ORACLE_PRICE_SCALE },
   *   { lltv: 50_0000000000000000n },
   * );
   * // borrowable satisfies bigint | undefined
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function getMaxBorrowableAssets(
    {
      collateral,
      borrowShares,
    }: { collateral: BigIntish; borrowShares: BigIntish },
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
      price?: BigIntish;
    },
    marketParams: { lltv: BigIntish },
  ) {
    const maxBorrowAssets = getMaxBorrowAssets(
      collateral,
      market,
      marketParams,
    );
    if (maxBorrowAssets == null) return;

    return MathLib.zeroFloorSub(
      maxBorrowAssets,
      toBorrowAssets(borrowShares, market),
    );
  }

  /**
   * Returns the amount of collateral that would be seized in a liquidation given a certain amount of repaid shares.
   * Return `undefined` iff the market's price is undefined.
   *
   * @param repaidShares - The borrow shares repaid by the liquidation.
   * @param market.totalBorrowAssets - The market's total borrowed assets.
   * @param market.totalBorrowShares - The market's total borrow shares.
   * @param market.price - The oracle price, scaled by `ORACLE_PRICE_SCALE`.
   * @param config.lltv - The market liquidation loan-to-value, scaled by WAD.
   * @returns The seized collateral amount, or `undefined` when price is unavailable.
   * @example
   * ```ts
   * import { MarketUtils, ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";
   *
   * const seized = MarketUtils.getLiquidationSeizedAssets(
   *   1n,
   *   { totalBorrowAssets: 1n, totalBorrowShares: 1n, price: ORACLE_PRICE_SCALE },
   *   { lltv: 86_0000000000000000n },
   * );
   * // seized satisfies bigint | undefined
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function getLiquidationSeizedAssets(
    repaidShares: BigIntish,
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
      price?: BigIntish;
    },
    config: { lltv: BigIntish },
  ) {
    if (market.price == null) return;

    market.price = BigInt(market.price);
    if (market.price === 0n) return 0n;

    return MathLib.mulDivDown(
      MathLib.wMulDown(
        toBorrowAssets(repaidShares, market, "Down"),
        getLiquidationIncentiveFactor(config),
      ),
      ORACLE_PRICE_SCALE,
      market.price,
    );
  }

  /**
   * Returns the amount of borrow shares that would be repaid in a liquidation given a certain amount of seized collateral.
   * Return `undefined` iff the market's price is undefined.
   *
   * @param seizedAssets - The collateral amount seized by the liquidation.
   * @param market.totalBorrowAssets - The market's total borrowed assets.
   * @param market.totalBorrowShares - The market's total borrow shares.
   * @param market.price - The oracle price, scaled by `ORACLE_PRICE_SCALE`.
   * @param config.lltv - The market liquidation loan-to-value, scaled by WAD.
   * @returns The borrow shares repaid, or `undefined` when price is unavailable.
   * @example
   * ```ts
   * import { MarketUtils, ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";
   *
   * const shares = MarketUtils.getLiquidationRepaidShares(
   *   1n,
   *   { totalBorrowAssets: 1n, totalBorrowShares: 1n, price: ORACLE_PRICE_SCALE },
   *   { lltv: 86_0000000000000000n },
   * );
   * // shares satisfies bigint | undefined
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function getLiquidationRepaidShares(
    seizedAssets: BigIntish,
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
      price?: BigIntish;
    },
    config: { lltv: BigIntish },
  ) {
    if (market.price == null) return;

    return toBorrowShares(
      MathLib.wDivUp(
        MathLib.mulDivUp(seizedAssets, market.price, ORACLE_PRICE_SCALE),
        getLiquidationIncentiveFactor(config),
      ),
      market,
      "Up",
    );
  }

  /**
   * Returns the maximum amount of collateral that is worth being seized in a liquidation given a certain borrow position.
   * Return `undefined` iff the market's price is undefined.
   *
   * @param position.collateral - The collateral amount in the position.
   * @param position.borrowShares - The borrow shares in the position.
   * @param market.totalBorrowAssets - The market's total borrowed assets.
   * @param market.totalBorrowShares - The market's total borrow shares.
   * @param market.price - The oracle price, scaled by `ORACLE_PRICE_SCALE`.
   * @param config.lltv - The market liquidation loan-to-value, scaled by WAD.
   * @returns The maximum seizable collateral, or `undefined` when price is unavailable.
   * @example
   * ```ts
   * import { MarketUtils, ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";
   *
   * const collateral = MarketUtils.getSeizableCollateral(
   *   { collateral: 1n, borrowShares: 1n },
   *   { totalBorrowAssets: 1n, totalBorrowShares: 1n, price: ORACLE_PRICE_SCALE },
   *   { lltv: 50_0000000000000000n },
   * );
   * // collateral satisfies bigint | undefined
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function getSeizableCollateral(
    position: { collateral: BigIntish; borrowShares: BigIntish },
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
      price?: BigIntish;
    },
    config: { lltv: BigIntish },
  ) {
    if (market.price == null) return; // Must be checked before calling `isHealthy`.

    market.price = BigInt(market.price);
    if (market.price === 0n || isHealthy(position, market, config)) return 0n;

    return MathLib.min(
      position.collateral,
      getLiquidationSeizedAssets(position.borrowShares, market, config)!,
    );
  }

  /**
   * Returns the amount of collateral that can be withdrawn given a certain borrow position.
   * Return `undefined` iff the market's price is undefined.
   *
   * @param position.collateral - The collateral amount in the position.
   * @param position.borrowShares - The borrow shares in the position.
   * @param market.totalBorrowAssets - The market's total borrowed assets.
   * @param market.totalBorrowShares - The market's total borrow shares.
   * @param market.price - The oracle price, scaled by `ORACLE_PRICE_SCALE`.
   * @param marketParams.lltv - The market liquidation loan-to-value, scaled by WAD.
   * @returns The withdrawable collateral amount, or `undefined` when price is unavailable.
   * @example
   * ```ts
   * import { MarketUtils, ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";
   *
   * const collateral = MarketUtils.getWithdrawableCollateral(
   *   { collateral: 2n, borrowShares: 0n },
   *   { totalBorrowAssets: 0n, totalBorrowShares: 0n, price: ORACLE_PRICE_SCALE },
   *   { lltv: 50_0000000000000000n },
   * );
   * // collateral satisfies bigint | undefined
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function getWithdrawableCollateral(
    {
      collateral,
      borrowShares,
    }: { collateral: BigIntish; borrowShares: BigIntish },
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
      price?: BigIntish;
    },
    { lltv }: { lltv: BigIntish },
  ) {
    if (market.price == null) return;

    market.price = BigInt(market.price);
    if (market.price === 0n) return 0n;

    return MathLib.zeroFloorSub(
      collateral,
      MathLib.wDivUp(
        MathLib.mulDivUp(
          toBorrowAssets(borrowShares, market),
          ORACLE_PRICE_SCALE,
          market.price,
        ),
        lltv,
      ),
    );
  }

  /**
   * Returns whether a given borrow position is healthy.
   * Return `undefined` iff the market's price is undefined.
   * @param position The borrow position to check.
   * @param market The market state used to value the position.
   * @param marketParams The market params containing LLTV.
   * @returns Whether the position is healthy, or `undefined` when price is unavailable.
   * @example
   * ```ts
   * import { MarketUtils, ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";
   *
   * const healthy = MarketUtils.isHealthy(
   *   { collateral: 2n, borrowShares: 0n },
   *   { totalBorrowAssets: 0n, totalBorrowShares: 0n, price: ORACLE_PRICE_SCALE },
   *   { lltv: 50_0000000000000000n },
   * );
   * // healthy satisfies boolean | undefined
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function isHealthy(
    {
      collateral,
      borrowShares,
    }: { collateral: BigIntish; borrowShares: BigIntish },
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
      price?: BigIntish;
    },
    marketParams: { lltv: BigIntish },
  ) {
    const maxBorrowAssets = getMaxBorrowAssets(
      collateral,
      market,
      marketParams,
    );
    if (maxBorrowAssets == null) return;

    return maxBorrowAssets >= toBorrowAssets(borrowShares, market);
  }

  /**
   * Returns the price of the collateral quoted in the loan token (e.g. ETH/DAI)
   * that set the user's position to be liquidatable.
   * Returns null if the position is not a borrow.
   *
   * @param position.collateral - The collateral amount in the position.
   * @param position.borrowShares - The borrow shares in the position.
   * @param market.totalBorrowAssets - The market's total borrowed assets.
   * @param market.totalBorrowShares - The market's total borrow shares.
   * @param marketParams.lltv - The market liquidation loan-to-value, scaled by WAD.
   * @returns The liquidation price, or `null` when the position has no borrow.
   * @example
   * ```ts
   * import { MarketUtils } from "@morpho-org/blue-sdk";
   *
   * const price = MarketUtils.getLiquidationPrice(
   *   { collateral: 2n, borrowShares: 1n },
   *   { totalBorrowAssets: 1n, totalBorrowShares: 1n },
   *   { lltv: 50_0000000000000000n },
   * );
   * // price satisfies bigint | null
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function getLiquidationPrice(
    {
      collateral,
      borrowShares,
    }: { collateral: BigIntish; borrowShares: BigIntish },
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
    },
    marketParams: { lltv: BigIntish },
  ) {
    borrowShares = BigInt(borrowShares);
    market.totalBorrowShares = BigInt(market.totalBorrowShares);
    if (borrowShares === 0n || market.totalBorrowShares === 0n) return null;

    const collateralPower = getCollateralPower(collateral, marketParams);
    if (collateralPower === 0n) return MathLib.MAX_UINT_256;

    const borrowAssets = toBorrowAssets(borrowShares, market);

    return MathLib.mulDivUp(borrowAssets, ORACLE_PRICE_SCALE, collateralPower);
  }

  /**
   * Returns the price variation required for the given position to reach its liquidation threshold (scaled by WAD).
   * Negative when healthy (the price needs to drop x%), positive when unhealthy (the price needs to soar x%).
   * Returns `undefined` iff the market's price is undefined.
   * Returns null if the position is not a borrow.
   *
   * @param position - The borrow position to evaluate.
   * @param market - The market state used to value the position.
   * @param marketParams - The market params containing LLTV.
   * @returns The WAD-scaled price variation, `undefined`, or `null` when the position has no borrow.
   * @example
   * ```ts
   * import { MarketUtils, ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";
   *
   * const variation = MarketUtils.getPriceVariationToLiquidationPrice(
   *   { collateral: 2n, borrowShares: 1n },
   *   { totalBorrowAssets: 1n, totalBorrowShares: 1n, price: ORACLE_PRICE_SCALE },
   *   { lltv: 50_0000000000000000n },
   * );
   * // variation satisfies bigint | null | undefined
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function getPriceVariationToLiquidationPrice(
    position: { collateral: BigIntish; borrowShares: BigIntish },
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
      price?: BigIntish;
    },
    marketParams: { lltv: BigIntish },
  ) {
    if (market.price == null) return;

    market.price = BigInt(market.price);
    if (market.price === 0n) return null;

    const liquidationPrice = getLiquidationPrice(
      position,
      market,
      marketParams,
    );
    if (liquidationPrice == null) return null;

    return MathLib.wDivUp(liquidationPrice, market.price) - MathLib.WAD;
  }

  /**
   * Returns the health factor of a given borrow position (scaled by WAD).
   * If the debt is 0, health factor is `MaxUint256`.
   * Returns `undefined` iff the market's price is undefined.
   *
   * @param position.collateral - The collateral amount in the position.
   * @param position.borrowShares - The borrow shares in the position.
   * @param market.totalBorrowAssets - The market's total borrowed assets.
   * @param market.totalBorrowShares - The market's total borrow shares.
   * @param market.price - The oracle price, scaled by `ORACLE_PRICE_SCALE`.
   * @param marketParams.lltv - The market liquidation loan-to-value, scaled by WAD.
   * @returns The WAD-scaled health factor, or `undefined` when price is unavailable.
   * @example
   * ```ts
   * import { MarketUtils, ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";
   *
   * const healthFactor = MarketUtils.getHealthFactor(
   *   { collateral: 2n, borrowShares: 1n },
   *   { totalBorrowAssets: 1n, totalBorrowShares: 1n, price: ORACLE_PRICE_SCALE },
   *   { lltv: 50_0000000000000000n },
   * );
   * // healthFactor satisfies bigint | undefined
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function getHealthFactor(
    {
      collateral,
      borrowShares,
    }: { collateral: BigIntish; borrowShares: BigIntish },
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
      price?: BigIntish;
    },
    marketParams: { lltv: BigIntish },
  ) {
    const borrowAssets = toBorrowAssets(borrowShares, market);
    if (borrowAssets === 0n) return MathLib.MAX_UINT_256;

    const maxBorrowAssets = getMaxBorrowAssets(
      collateral,
      market,
      marketParams,
    );
    if (maxBorrowAssets == null) return;

    return MathLib.wDivDown(maxBorrowAssets, borrowAssets);
  }

  /**
   * Returns the loan-to-value ratio of a given borrow position (scaled by WAD).
   * Returns `undefined` iff the market's price is undefined.
   * Returns null if the position is not a borrow.
   *
   * @param position.collateral - The collateral amount in the position.
   * @param position.borrowShares - The borrow shares in the position.
   * @param market.totalBorrowAssets - The market's total borrowed assets.
   * @param market.totalBorrowShares - The market's total borrow shares.
   * @param market.price - The oracle price, scaled by `ORACLE_PRICE_SCALE`.
   * @returns The WAD-scaled loan-to-value ratio, `undefined`, or `null` when the position has no borrow.
   * @example
   * ```ts
   * import { MarketUtils, ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";
   *
   * const ltv = MarketUtils.getLtv(
   *   { collateral: 2n, borrowShares: 1n },
   *   { totalBorrowAssets: 1n, totalBorrowShares: 1n, price: ORACLE_PRICE_SCALE },
   * );
   * // ltv satisfies bigint | null | undefined
   * ```
   */
  export function getLtv(
    {
      collateral,
      borrowShares,
    }: { collateral: BigIntish; borrowShares: BigIntish },
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
      price?: BigIntish;
    },
  ) {
    borrowShares = BigInt(borrowShares);
    market.totalBorrowShares = BigInt(market.totalBorrowShares);
    if (borrowShares === 0n || market.totalBorrowShares === 0n) return null;

    const collateralValue = getCollateralValue(collateral, market);
    if (collateralValue == null) return;
    if (collateralValue === 0n) return MathLib.MAX_UINT_256;

    return MathLib.wDivUp(
      toBorrowAssets(borrowShares, market),
      collateralValue,
    );
  }

  /**
   * Returns the usage ratio of the maximum borrow capacity given a certain borrow position (scaled by WAD).
   * Returns `undefined` iff the market's price is undefined.
   *
   * @param position - The borrow position to evaluate.
   * @param market - The market state used to value the position.
   * @param marketParams - The market params containing LLTV.
   * @returns The WAD-scaled borrow capacity usage, or `undefined` when price is unavailable.
   * @example
   * ```ts
   * import { MarketUtils, ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";
   *
   * const usage = MarketUtils.getBorrowCapacityUsage(
   *   { collateral: 2n, borrowShares: 1n },
   *   { totalBorrowAssets: 1n, totalBorrowShares: 1n, price: ORACLE_PRICE_SCALE },
   *   { lltv: 50_0000000000000000n },
   * );
   * // usage satisfies bigint | undefined
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function getBorrowCapacityUsage(
    position: { collateral: BigIntish; borrowShares: BigIntish },
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
      price?: BigIntish;
    },
    marketParams: { lltv: BigIntish },
  ) {
    const hf = getHealthFactor(position, market, marketParams);
    if (hf === undefined) return;
    if (hf === 0n) return MathLib.MAX_UINT_256;

    return MathLib.wDivUp(MathLib.WAD, hf);
  }

  /**
   * Converts market supply shares to loan assets.
   *
   * @param shares - The supply shares to convert.
   * @param market.totalSupplyAssets - The market's total supplied assets.
   * @param market.totalSupplyShares - The market's total supply shares.
   * @param rounding - Optional rounding direction. Defaults to `"Down"`.
   * @returns The equivalent amount of supplied loan assets.
   * @example
   * ```ts
   * import { MarketUtils } from "@morpho-org/blue-sdk";
   *
   * const assets = MarketUtils.toSupplyAssets(100n, {
   *   totalSupplyAssets: 1_000n,
   *   totalSupplyShares: 100n,
   * });
   * // assets satisfies bigint
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function toSupplyAssets(
    shares: BigIntish,
    market: {
      totalSupplyAssets: BigIntish;
      totalSupplyShares: BigIntish;
    },
    rounding: RoundingDirection = "Down",
  ) {
    return SharesMath.toAssets(
      shares,
      market.totalSupplyAssets,
      market.totalSupplyShares,
      rounding,
    );
  }

  /**
   * Converts market supply assets to supply shares.
   *
   * @param assets - The supplied loan assets to convert.
   * @param market.totalSupplyAssets - The market's total supplied assets.
   * @param market.totalSupplyShares - The market's total supply shares.
   * @param rounding - Optional rounding direction. Defaults to `"Up"`.
   * @returns The equivalent amount of supply shares.
   * @example
   * ```ts
   * import { MarketUtils } from "@morpho-org/blue-sdk";
   *
   * const shares = MarketUtils.toSupplyShares(100n, {
   *   totalSupplyAssets: 1_000n,
   *   totalSupplyShares: 100n,
   * });
   * // shares satisfies bigint
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function toSupplyShares(
    assets: BigIntish,
    market: {
      totalSupplyAssets: BigIntish;
      totalSupplyShares: BigIntish;
    },
    rounding: RoundingDirection = "Up",
  ) {
    return SharesMath.toShares(
      assets,
      market.totalSupplyAssets,
      market.totalSupplyShares,
      rounding,
    );
  }

  /**
   * Converts market borrow shares to loan assets.
   *
   * @param shares - The borrow shares to convert.
   * @param market.totalBorrowAssets - The market's total borrowed assets.
   * @param market.totalBorrowShares - The market's total borrow shares.
   * @param rounding - Optional rounding direction. Defaults to `"Up"`.
   * @returns The equivalent amount of borrowed loan assets.
   * @example
   * ```ts
   * import { MarketUtils } from "@morpho-org/blue-sdk";
   *
   * const assets = MarketUtils.toBorrowAssets(100n, {
   *   totalBorrowAssets: 1_000n,
   *   totalBorrowShares: 100n,
   * });
   * // assets satisfies bigint
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function toBorrowAssets(
    shares: BigIntish,
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
    },
    rounding: RoundingDirection = "Up",
  ) {
    return SharesMath.toAssets(
      shares,
      market.totalBorrowAssets,
      market.totalBorrowShares,
      rounding,
    );
  }

  /**
   * Converts market borrow assets to borrow shares.
   *
   * @param assets - The borrowed loan assets to convert.
   * @param market.totalBorrowAssets - The market's total borrowed assets.
   * @param market.totalBorrowShares - The market's total borrow shares.
   * @param rounding - Optional rounding direction. Defaults to `"Down"`.
   * @returns The equivalent amount of borrow shares.
   * @example
   * ```ts
   * import { MarketUtils } from "@morpho-org/blue-sdk";
   *
   * const shares = MarketUtils.toBorrowShares(100n, {
   *   totalBorrowAssets: 1_000n,
   *   totalBorrowShares: 100n,
   * });
   * // shares satisfies bigint
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function toBorrowShares(
    assets: BigIntish,
    market: {
      totalBorrowAssets: BigIntish;
      totalBorrowShares: BigIntish;
    },
    rounding: RoundingDirection = "Down",
  ) {
    return SharesMath.toShares(
      assets,
      market.totalBorrowAssets,
      market.totalBorrowShares,
      rounding,
    );
  }
}
