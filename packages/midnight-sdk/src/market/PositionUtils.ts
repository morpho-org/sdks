import { type BigIntish, MathLib } from "@morpho-org/morpho-ts";

import {
  InvalidPositionAccrualStateError,
  InvalidPositionAccrualTimestampError,
  InvalidPositionLossFactorError,
} from "../errors.js";
import type {
  CollateralParams,
  IMarket,
  IMarketParams,
  SettlementFeeCbps,
} from "./Market.js";
import type { IPosition } from "./Position.js";

/**
 * Domain helpers for Midnight positions.
 *
 * @example
 * ```ts
 * import { PositionUtils } from "@morpho-org/midnight-sdk";
 *
 * const accrued = PositionUtils.accrueInterest({
 *   position: {
 *     credit: 1_000n,
 *     pendingFee: 100n,
 *     lastLossFactor: 0n,
 *     lastAccrual: 1_000n,
 *     debt: 0n,
 *     collateralBitmap: 1n,
 *     collateral: [50n],
 *   },
 *   market: {
 *     params: {
 *       chainId: 8453,
 *       midnight: "0x0000000000000000000000000000000000001000",
 *       loanToken: "0x0000000000000000000000000000000000006000",
 *       collateralParams: [
 *         {
 *           token: "0x0000000000000000000000000000000000007000",
 *           lltv: 770000000000000000n,
 *           liquidationCursor: 250000000000000000n,
 *           oracle: "0x0000000000000000000000000000000000008000",
 *         },
 *       ],
 *       maturity: 54_000n,
 *       rcfThreshold: 0n,
 *       enterGate: "0x0000000000000000000000000000000000000000",
 *       liquidatorGate: "0x0000000000000000000000000000000000000000",
 *     },
 *     totalUnits: 1_000n,
 *     lossFactor: 0n,
 *     withdrawable: 500n,
 *     continuousFeeCredit: 0n,
 *     settlementFeeCbps: [1, 2, 3, 4, 5, 6, 7],
 *     continuousFee: 10,
 *     tickSpacing: 4,
 *   },
 *   timestamp: 1_500n,
 * });
 * console.log(accrued.position.credit);
 * ```
 */
export namespace PositionUtils {
  /**
   * Returns plain Midnight position and market objects accrued like Midnight `updatePositionView`.
   *
   * @param params.position - Position state to accrue.
   * @param params.market - Hydrated market state used for loss factor and continuous-fee accrual.
   * @param params.timestamp - Timestamp at which to accrue.
   * @returns New plain position and market objects with updated credit, pending fee, last loss factor, last accrual, and market continuous-fee credit.
   * @throws {InvalidPositionAccrualTimestampError} when timestamp is before `lastAccrual`.
   * @throws {InvalidPositionLossFactorError} when the market loss factor is older than the position loss factor.
   * @throws {InvalidPositionAccrualStateError} when raw inputs violate Midnight accounting invariants.
   * @example
   * ```ts
   * import { PositionUtils } from "@morpho-org/midnight-sdk";
   *
   * const { position, market } = PositionUtils.accrueInterest({
   *   position: {
   *     credit: 1_000n,
   *     pendingFee: 100n,
   *     lastLossFactor: 0n,
   *     lastAccrual: 1_000n,
   *     debt: 0n,
   *     collateralBitmap: 1n,
   *     collateral: [50n],
   *   },
   *   market: {
   *     params: {
   *       chainId: 8453,
   *       midnight: "0x0000000000000000000000000000000000001000",
   *       loanToken: "0x0000000000000000000000000000000000006000",
   *       collateralParams: [
   *         {
   *           token: "0x0000000000000000000000000000000000007000",
   *           lltv: 770000000000000000n,
   *           liquidationCursor: 250000000000000000n,
   *           oracle: "0x0000000000000000000000000000000000008000",
   *         },
   *       ],
   *       maturity: 54_000n,
   *       rcfThreshold: 0n,
   *       enterGate: "0x0000000000000000000000000000000000000000",
   *       liquidatorGate: "0x0000000000000000000000000000000000000000",
   *     },
   *     totalUnits: 1_000n,
   *     lossFactor: 0n,
   *     withdrawable: 500n,
   *     continuousFeeCredit: 0n,
   *     settlementFeeCbps: [1, 2, 3, 4, 5, 6, 7],
   *     continuousFee: 10,
   *     tickSpacing: 4,
   *   },
   *   timestamp: 1_500n,
   * });
   * console.log(position.lastAccrual, market.continuousFeeCredit);
   * ```
   */
  export function accrueInterest(params: {
    readonly position: IPosition;
    readonly market: IMarket;
    readonly timestamp: BigIntish;
  }): {
    readonly position: IPosition;
    readonly market: IMarket;
    readonly accruedFee: bigint;
  } {
    const timestamp = BigInt(params.timestamp);
    const credit = BigInt(params.position.credit);
    const pendingFee = BigInt(params.position.pendingFee);
    const lastLossFactor = BigInt(params.position.lastLossFactor);
    const lastAccrual = BigInt(params.position.lastAccrual);
    const marketLossFactor = BigInt(params.market.lossFactor);

    if (timestamp < lastAccrual) {
      throw new InvalidPositionAccrualTimestampError(timestamp, lastAccrual);
    }
    if (marketLossFactor < lastLossFactor) {
      throw new InvalidPositionLossFactorError(
        marketLossFactor,
        lastLossFactor,
      );
    }
    if (pendingFee > credit) {
      throw new InvalidPositionAccrualStateError(
        "Pending fee must be less than or equal to credit.",
      );
    }

    const postSlashCredit =
      lastLossFactor < MathLib.MAX_UINT_128
        ? MathLib.mulDivDown(
            credit,
            MathLib.MAX_UINT_128 - marketLossFactor,
            MathLib.MAX_UINT_128 - lastLossFactor,
          )
        : 0n;
    if (postSlashCredit > credit) {
      throw new InvalidPositionAccrualStateError(
        "Post-slash credit cannot exceed stored credit.",
      );
    }

    const creditDecrease = credit - postSlashCredit;
    const pendingFeeDecrease =
      credit > 0n ? MathLib.mulDivUp(pendingFee, creditDecrease, credit) : 0n;
    if (pendingFeeDecrease > pendingFee) {
      throw new InvalidPositionAccrualStateError(
        "Pending-fee decrease cannot exceed pending fee.",
      );
    }

    const postSlashPendingFee = pendingFee - pendingFeeDecrease;
    const maturity = BigInt(params.market.params.maturity);
    const accrualEnd = timestamp < maturity ? timestamp : maturity;
    const accruedFee =
      lastAccrual < maturity
        ? MathLib.mulDivDown(
            postSlashPendingFee,
            accrualEnd - lastAccrual,
            maturity - lastAccrual,
          )
        : 0n;
    if (accruedFee > postSlashCredit || accruedFee > postSlashPendingFee) {
      throw new InvalidPositionAccrualStateError(
        "Accrued fee cannot exceed post-slash credit or pending fee.",
      );
    }

    const collateral = params.position.collateral.map((assets) =>
      BigInt(assets),
    );
    const collateralParams = params.market.params.collateralParams.map(
      (collateralParam) =>
        ({
          token: collateralParam.token,
          lltv: BigInt(collateralParam.lltv),
          liquidationCursor: BigInt(collateralParam.liquidationCursor),
          oracle: collateralParam.oracle,
        }) satisfies CollateralParams,
    );
    const marketParams = {
      chainId: BigInt(params.market.params.chainId),
      midnight: params.market.params.midnight,
      loanToken: params.market.params.loanToken,
      collateralParams,
      maturity,
      rcfThreshold: BigInt(params.market.params.rcfThreshold),
      enterGate: params.market.params.enterGate,
      liquidatorGate: params.market.params.liquidatorGate,
    } satisfies IMarketParams;
    const settlementFeeCbps = [
      params.market.settlementFeeCbps[0],
      params.market.settlementFeeCbps[1],
      params.market.settlementFeeCbps[2],
      params.market.settlementFeeCbps[3],
      params.market.settlementFeeCbps[4],
      params.market.settlementFeeCbps[5],
      params.market.settlementFeeCbps[6],
    ] satisfies SettlementFeeCbps;

    return {
      position: {
        credit: postSlashCredit - accruedFee,
        pendingFee: postSlashPendingFee - accruedFee,
        lastLossFactor: marketLossFactor,
        lastAccrual: timestamp,
        debt: BigInt(params.position.debt),
        collateralBitmap: BigInt(params.position.collateralBitmap),
        collateral,
      },
      market: {
        params: marketParams,
        totalUnits: BigInt(params.market.totalUnits),
        lossFactor: marketLossFactor,
        withdrawable: BigInt(params.market.withdrawable),
        continuousFeeCredit:
          BigInt(params.market.continuousFeeCredit) + accruedFee,
        settlementFeeCbps,
        continuousFee: params.market.continuousFee,
        tickSpacing: params.market.tickSpacing,
      },
      accruedFee,
    };
  }
}
