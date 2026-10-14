import {
  InvalidPositionAccrualStateError,
  InvalidPositionAccrualTimestampError,
  InvalidPositionLossFactorError,
} from "./errors.js";
import { MathLib } from "./math.js";
import type { BigIntish } from "./types.js";

/**
 * Pure helpers for accruing a Midnight position's credit, pending fee, and net credit.
 *
 * @throws {InvalidPositionAccrualTimestampError} when timestamp is before last accrual.
 * @throws {InvalidPositionLossFactorError} when market loss factor is older than the position loss factor.
 * @throws {InvalidPositionAccrualStateError} when inputs violate Midnight accounting invariants.
 * @example
 * ```ts
 * import { MidnightPositionLib } from "@morpho-org/morpho-ts";
 *
 * const currentNetCredit = MidnightPositionLib.netCredit({
 *   credit: 1_000n,
 *   pendingFee: 100n,
 *   lastLossFactor: 0n,
 *   lastAccrual: 1_000n,
 *   marketLossFactor: 0n,
 *   maturity: 2_000n,
 *   timestamp: 1_500n,
 * });
 * // 900n
 * ```
 */
export namespace MidnightPositionLib {
  /**
   * Returns position credit, pending fee, and accrued fee using Midnight's
   * `updatePositionView` slash and continuous-fee rules.
   *
   * @param params.credit - Position credit before slashing and fee accrual.
   * @param params.pendingFee - Position pending fee before slashing and fee accrual.
   * @param params.lastLossFactor - Loss factor last applied to the position.
   * @param params.lastAccrual - Timestamp of the position's last accrual.
   * @param params.marketLossFactor - Current market loss factor.
   * @param params.maturity - Market maturity timestamp.
   * @param params.timestamp - Timestamp at which to accrue.
   * @returns Updated credit, pending fee, and accrued fee.
   * @throws {InvalidPositionAccrualTimestampError} when timestamp is before last accrual.
   * @throws {InvalidPositionLossFactorError} when market loss factor is older than the position loss factor.
   * @throws {InvalidPositionAccrualStateError} when inputs violate Midnight accounting invariants.
   * @example
   * ```ts
   * import { MidnightPositionLib } from "@morpho-org/morpho-ts";
   *
   * const accrued = MidnightPositionLib.accrue({
   *   credit: 1_000n,
   *   pendingFee: 100n,
   *   lastLossFactor: 0n,
   *   lastAccrual: 1_000n,
   *   marketLossFactor: 0n,
   *   maturity: 2_000n,
   *   timestamp: 1_500n,
   * });
   * // { credit: 950n, pendingFee: 50n, accruedFee: 50n }
   * ```
   */
  export function accrue(params: {
    readonly credit: BigIntish;
    readonly pendingFee: BigIntish;
    readonly lastLossFactor: BigIntish;
    readonly lastAccrual: BigIntish;
    readonly marketLossFactor: BigIntish;
    readonly maturity: BigIntish;
    readonly timestamp: BigIntish;
  }): {
    readonly credit: bigint;
    readonly pendingFee: bigint;
    readonly accruedFee: bigint;
  } {
    const timestamp = BigInt(params.timestamp);
    const credit = BigInt(params.credit);
    const pendingFee = BigInt(params.pendingFee);
    const lastLossFactor = BigInt(params.lastLossFactor);
    const lastAccrual = BigInt(params.lastAccrual);
    const marketLossFactor = BigInt(params.marketLossFactor);
    const maturity = BigInt(params.maturity);

    if (timestamp < lastAccrual) {
      throw new InvalidPositionAccrualTimestampError(timestamp, lastAccrual);
    }
    if (marketLossFactor < lastLossFactor) {
      throw new InvalidPositionLossFactorError(
        marketLossFactor,
        lastLossFactor,
      );
    }
    if (credit < 0n)
      throw new InvalidPositionAccrualStateError(
        `Credit "${credit}" must be non-negative.`,
      );
    if (pendingFee < 0n)
      throw new InvalidPositionAccrualStateError(
        `Pending fee "${pendingFee}" must be non-negative.`,
      );
    if (lastLossFactor < 0n)
      throw new InvalidPositionAccrualStateError(
        `Last loss factor "${lastLossFactor}" must be non-negative.`,
      );
    if (lastAccrual < 0n)
      throw new InvalidPositionAccrualStateError(
        `Last accrual "${lastAccrual}" must be non-negative.`,
      );
    if (maturity < 0n)
      throw new InvalidPositionAccrualStateError(
        `Maturity "${maturity}" must be non-negative.`,
      );
    if (marketLossFactor > MathLib.MAX_UINT_128)
      throw new InvalidPositionAccrualStateError(
        `Market loss factor "${marketLossFactor}" must not exceed MAX_UINT_128 "${MathLib.MAX_UINT_128}".`,
      );
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
    const accrualEnd = MathLib.min(timestamp, maturity);
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

    return {
      credit: postSlashCredit - accruedFee,
      pendingFee: postSlashPendingFee - accruedFee,
      accruedFee,
    };
  }

  /**
   * Returns the position's net credit after slashing and continuous-fee accrual.
   *
   * @param params.credit - Position credit before slashing and fee accrual.
   * @param params.pendingFee - Position pending fee before slashing and fee accrual.
   * @param params.lastLossFactor - Loss factor last applied to the position.
   * @param params.lastAccrual - Timestamp of the position's last accrual.
   * @param params.marketLossFactor - Current market loss factor.
   * @param params.maturity - Market maturity timestamp.
   * @param params.timestamp - Timestamp at which to accrue.
   * @returns Accrued position credit minus accrued pending fee.
   * @throws {InvalidPositionAccrualTimestampError} when timestamp is before last accrual.
   * @throws {InvalidPositionLossFactorError} when market loss factor is older than the position loss factor.
   * @throws {InvalidPositionAccrualStateError} when inputs violate Midnight accounting invariants.
   * @example
   * ```ts
   * import { MidnightPositionLib } from "@morpho-org/morpho-ts";
   *
   * const currentNetCredit = MidnightPositionLib.netCredit({
   *   credit: 1_000n,
   *   pendingFee: 100n,
   *   lastLossFactor: 0n,
   *   lastAccrual: 1_000n,
   *   marketLossFactor: 0n,
   *   maturity: 2_000n,
   *   timestamp: 1_500n,
   * });
   * // 900n
   * ```
   */
  export function netCredit(params: {
    readonly credit: BigIntish;
    readonly pendingFee: BigIntish;
    readonly lastLossFactor: BigIntish;
    readonly lastAccrual: BigIntish;
    readonly marketLossFactor: BigIntish;
    readonly maturity: BigIntish;
    readonly timestamp: BigIntish;
  }): bigint {
    const { credit, pendingFee } = accrue(params);

    return credit - pendingFee;
  }
}
