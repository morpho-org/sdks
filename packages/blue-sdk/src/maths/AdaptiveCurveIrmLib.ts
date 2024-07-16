import { SECONDS_PER_YEAR } from "../constants";
import { BigIntish } from "../types";

import { MathLib } from "./MathLib";

/**
 * JS implementation of {@link https://github.com/morpho-org/morpho-blue-irm/blob/main/src/libraries/adaptive-curve/ExpLib.sol ExpLib} used by the Adaptive Curve IRM.
 */
export namespace AdaptiveCurveIrmLib {
  export const CURVE_STEEPNESS = 4_000000000000000000n;
  export const TARGET_UTILIZATION = 90_0000000000000000n;
  export const INITIAL_RATE_AT_TARGET = 4_0000000000000000n / SECONDS_PER_YEAR;
  export const ADJUSTMENT_SPEED = 50_000000000000000000n / SECONDS_PER_YEAR;
  export const MIN_RATE_AT_TARGET = 10_00000000000000n / SECONDS_PER_YEAR;
  export const MAX_RATE_AT_TARGET = 2_000000000000000000n / SECONDS_PER_YEAR;

  /**
   * ln(2), scaled by WAD.
   */
  export const LN_2_INT = 693147180559945309n;

  /**
   * ln(1e-18), scaled by WAD.
   */
  export const LN_WEI_INT = -41_446531673892822312n;

  /**
   * Above this bound, `wExp` is clipped to avoid overflowing when multiplied with 1 ether.
   * This upper bound corresponds to: ln(type(int256).max / 1e36) (scaled by WAD, floored).
   */
  export const WEXP_UPPER_BOUND = 93_859467695000404319n;

  /**
   * The value of wExp(`WEXP_UPPER_BOUND`).
   */
  export const WEXP_UPPER_VALUE =
    57716089161558943949701069502944508345128_422502756744429568n;

  /**
   * Returns an approximation of exp(x) used by the Adaptive Curve IRM.
   * @param x
   */
  export function wExp(x: BigIntish) {
    x = BigInt(x);

    // If x < ln(1e-18) then exp(x) < 1e-18 so it is rounded to zero.
    if (x < LN_WEI_INT) return 0n;
    // `wExp` is clipped to avoid overflowing when multiplied with 1 ether.
    if (x >= WEXP_UPPER_BOUND) return WEXP_UPPER_VALUE;

    // Decompose x as x = q * ln(2) + r with q an integer and -ln(2)/2 <= r <= ln(2)/2.
    // q = x / ln(2) rounded half toward zero.
    const roundingAdjustment = x < 0n ? -(LN_2_INT / 2n) : LN_2_INT / 2n;
    const q = (x + roundingAdjustment) / LN_2_INT;
    const r = x - q * LN_2_INT;

    // Compute e^r with a 2nd-order Taylor polynomial.
    const expR = MathLib.WAD + r + (r * r) / MathLib.WAD / 2n;

    // Return e^x = 2^q * e^r.
    if (q === 0n) return expR << q;
    return expR >> -q;
  }

  export function getBorrowRate(
    startUtilization: BigIntish,
    startRateAtTarget: BigIntish,
    elapsed: BigIntish,
  ) {
    startUtilization = BigInt(startUtilization);
    startRateAtTarget = BigInt(startRateAtTarget);
    elapsed = BigInt(elapsed);

    const errNormFactor =
      startUtilization > TARGET_UTILIZATION
        ? MathLib.WAD - TARGET_UTILIZATION
        : TARGET_UTILIZATION;
    const err = MathLib.wDivDown(
      startUtilization - TARGET_UTILIZATION,
      errNormFactor,
    );

    let avgRateAtTarget;
    let endRateAtTarget;

    if (startRateAtTarget === 0n) {
      // First interaction.
      avgRateAtTarget = INITIAL_RATE_AT_TARGET;
      endRateAtTarget = INITIAL_RATE_AT_TARGET;
    } else {
      // The speed is assumed constant between two updates, but it is in fact not constant because of interest.
      // So the rate is always underestimated.
      const speed = MathLib.wMulDown(ADJUSTMENT_SPEED, err);
      const linearAdaptation = speed * elapsed;

      if (linearAdaptation === 0n) {
        // If linearAdaptation == 0, avgRateAtTarget = endRateAtTarget = startRateAtTarget;
        avgRateAtTarget = startRateAtTarget;
        endRateAtTarget = startRateAtTarget;
      } else {
        // Non negative because MIN_RATE_AT_TARGET > 0.
        const _newRateAtTarget = (linearAdaptation: BigIntish) =>
          MathLib.min(
            MathLib.max(
              MathLib.wMulDown(startRateAtTarget, wExp(linearAdaptation)),
              MIN_RATE_AT_TARGET,
            ),
            MAX_RATE_AT_TARGET,
          );

        // Formula of the average rate that should be returned to Morpho Blue:
        // avg = 1/T * ∫_0^T curve(startRateAtTarget*exp(speed*x), err) dx
        // The integral is approximated with the trapezoidal rule:
        // avg ~= 1/T * Σ_i=1^N [curve(f((i-1) * T/N), err) + curve(f(i * T/N), err)] / 2 * T/N
        // Where f(x) = startRateAtTarget*exp(speed*x)
        // avg ~= Σ_i=1^N [curve(f((i-1) * T/N), err) + curve(f(i * T/N), err)] / (2 * N)
        // As curve is linear in its first argument:
        // avg ~= curve([Σ_i=1^N [f((i-1) * T/N) + f(i * T/N)] / (2 * N), err)
        // avg ~= curve([(f(0) + f(T))/2 + Σ_i=1^(N-1) f(i * T/N)] / N, err)
        // avg ~= curve([(startRateAtTarget + endRateAtTarget)/2 + Σ_i=1^(N-1) f(i * T/N)] / N, err)
        // With N = 2:
        // avg ~= curve([(startRateAtTarget + endRateAtTarget)/2 + startRateAtTarget*exp(speed*T/2)] / 2, err)
        // avg ~= curve([startRateAtTarget + endRateAtTarget + 2*startRateAtTarget*exp(speed*T/2)] / 4, err)
        endRateAtTarget = _newRateAtTarget(linearAdaptation);
        avgRateAtTarget =
          (startRateAtTarget +
            endRateAtTarget +
            2n * _newRateAtTarget(linearAdaptation / 2n)) /
          4n;
      }
    }

    // Non negative because 1 - 1/C >= 0, C - 1 >= 0.
    const coeff =
      err < 0
        ? MathLib.WAD - MathLib.wDivDown(MathLib.WAD, CURVE_STEEPNESS)
        : CURVE_STEEPNESS - MathLib.WAD;

    // Non negative if avgRateAtTarget >= 0 because if err < 0, coeff <= 1.
    return {
      avgBorrowRate: MathLib.wMulDown(
        MathLib.wMulDown(coeff, err) + MathLib.WAD,
        avgRateAtTarget,
      ),
      endRateAtTarget,
    };
  }
}
