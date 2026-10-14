/** @internal */
export const WAD = 1_000000000000000000n;
/** @internal */
export const SECONDS_PER_YEAR = 31_536_000n;
/** @internal */
export const CURVE_STEEPNESS = 4_000000000000000000n;
/** @internal */
export const ADJUSTMENT_SPEED = 50_000000000000000000n / SECONDS_PER_YEAR;
/** @internal */
export const TARGET_UTILIZATION = 900000000000000000n;
/** @internal */
export const INITIAL_RATE_AT_TARGET = 40000000000000000n / SECONDS_PER_YEAR;
/** @internal */
export const MIN_RATE_AT_TARGET = 1000000000000000n / SECONDS_PER_YEAR;
/** @internal */
export const MAX_RATE_AT_TARGET = 2_000000000000000000n / SECONDS_PER_YEAR;
/** @internal */
export const LN_2_INT = 693147180559945309n;
/** @internal */
export const LN_WEI_INT = -41446531673892822312n;
/** @internal */
export const WEXP_UPPER_BOUND = 93859467695000404319n;
/** @internal */
export const WEXP_UPPER_VALUE =
  57716089161558943949701069502944508345128422502756744429568n;

/** @internal */
export function wExpRef(x: bigint) {
  if (x < LN_WEI_INT) return 0n;
  if (x >= WEXP_UPPER_BOUND) return WEXP_UPPER_VALUE;

  const adjustment = x < 0n ? -(LN_2_INT / 2n) : LN_2_INT / 2n;
  const q = (x + adjustment) / LN_2_INT;
  const r = x - q * LN_2_INT;
  const expR = WAD + r + (r * r) / WAD / 2n;

  return q >= 0n ? expR << q : expR >> -q;
}

/** @internal */
export function borrowRateRef({
  utilization,
  startRateAtTarget,
  elapsed,
}: {
  utilization: bigint;
  startRateAtTarget: bigint;
  elapsed: bigint;
}) {
  const errNorm =
    utilization > TARGET_UTILIZATION
      ? WAD - TARGET_UTILIZATION
      : TARGET_UTILIZATION;
  const err = ((utilization - TARGET_UTILIZATION) * WAD) / errNorm;
  let averageRateAtTarget: bigint;
  let endRateAtTarget: bigint;

  if (startRateAtTarget === 0n) {
    averageRateAtTarget = INITIAL_RATE_AT_TARGET;
    endRateAtTarget = INITIAL_RATE_AT_TARGET;
  } else {
    const linearAdaptation = ((ADJUSTMENT_SPEED * err) / WAD) * elapsed;

    if (linearAdaptation === 0n) {
      averageRateAtTarget = startRateAtTarget;
      endRateAtTarget = startRateAtTarget;
    } else {
      const endRate = (startRateAtTarget * wExpRef(linearAdaptation)) / WAD;
      endRateAtTarget =
        endRate < MIN_RATE_AT_TARGET
          ? MIN_RATE_AT_TARGET
          : endRate > MAX_RATE_AT_TARGET
            ? MAX_RATE_AT_TARGET
            : endRate;
      const halfRate =
        (startRateAtTarget * wExpRef(linearAdaptation / 2n)) / WAD;
      const averageHalfRate =
        halfRate < MIN_RATE_AT_TARGET
          ? MIN_RATE_AT_TARGET
          : halfRate > MAX_RATE_AT_TARGET
            ? MAX_RATE_AT_TARGET
            : halfRate;
      averageRateAtTarget =
        (startRateAtTarget + endRateAtTarget + 2n * averageHalfRate) / 4n;
    }
  }

  const coeff =
    err < 0n ? WAD - (WAD * WAD) / CURVE_STEEPNESS : CURVE_STEEPNESS - WAD;

  return {
    avgBorrowRate: (((coeff * err) / WAD + WAD) * averageRateAtTarget) / WAD,
    endBorrowRate: (((coeff * err) / WAD + WAD) * endRateAtTarget) / WAD,
    endRateAtTarget,
  };
}
