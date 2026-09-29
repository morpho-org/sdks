import { DEFAULT_SLIPPAGE_TOLERANCE, MathLib } from "@morpho-org/blue-sdk";
import { deepFreeze } from "@morpho-org/morpho-ts";
import { SimulationValidationError } from "../../errors.js";
import type { OperationLimit, SimulationLimits } from "../../limits.js";

/** {@link SimulationLimits} with every optional bound resolved to a concrete value. @internal */
export interface EffectiveSimulationLimits {
  readonly maxSlippageWad: bigint;
  readonly minLltvBufferWad: bigint;
  readonly maxSignatureLifetimeSeconds: bigint;
  readonly operations: readonly OperationLimit[];
}

/** Default slippage bound, identical to blue-sdk's `DEFAULT_SLIPPAGE_TOLERANCE` (0.03% WAD). */
export const DEFAULT_MAX_SLIPPAGE_WAD = DEFAULT_SLIPPAGE_TOLERANCE;

/** Default LLTV safety buffer: 0.5% WAD (WAD / 200). Callers may only increase it.
 * Must equal morpho-sdk's `DEFAULT_LLTV_BUFFER` (packages/morpho-sdk/src/helpers/constant.ts); the builder and verifier share this floor. */
export const DEFAULT_MIN_LLTV_BUFFER_WAD = MathLib.WAD / 200n;

/** Default maximum signature lifetime: 7200 seconds from the pinned execution timestamp. */
export const DEFAULT_MAX_SIGNATURE_LIFETIME_SECONDS = 7200n;

/**
 * Resolve caller-supplied {@link SimulationLimits} into fully defaulted
 * {@link EffectiveSimulationLimits}. Resolution is tightening-only: callers may
 * decrease `maxSlippageWad` and `maxSignatureLifetimeSeconds` and may increase
 * `minLltvBufferWad`, never the reverse.
 *
 * @param limits - Optional caller constraints; missing fields take the defaults.
 * @returns Deep-frozen limits with every field resolved.
 * @throws {SimulationValidationError} When a field is negative, exceeds the
 *   tightening bound, or `maxSignatureLifetimeSeconds` is zero.
 * @internal
 */
export function resolveEffectiveLimits(
  limits?: SimulationLimits,
): EffectiveSimulationLimits {
  const fieldErrors: string[] = [];

  const resolve = (field: {
    readonly name: string;
    readonly value: bigint | undefined;
    readonly fallback: bigint;
    readonly bound: "below" | "above";
    readonly minimum?: bigint;
  }): bigint => {
    const { name, value, fallback, bound, minimum = 0n } = field;
    if (value === undefined) return fallback;
    if (value < minimum) {
      fieldErrors.push(`${name}: must be at least ${minimum} (got ${value})`);
      return fallback;
    }
    if (
      (bound === "below" && value > fallback) ||
      (bound === "above" && value < fallback)
    ) {
      fieldErrors.push(
        `${name}: may only tighten the default ${fallback} (got ${value})`,
      );
      return fallback;
    }
    return value;
  };

  const maxSlippageWad = resolve({
    name: "limits.maxSlippageWad",
    value: limits?.maxSlippageWad,
    fallback: DEFAULT_MAX_SLIPPAGE_WAD,
    bound: "below",
  });
  const minLltvBufferWad = resolve({
    name: "limits.minLltvBufferWad",
    value: limits?.minLltvBufferWad,
    fallback: DEFAULT_MIN_LLTV_BUFFER_WAD,
    bound: "above",
  });
  const maxSignatureLifetimeSeconds = resolve({
    name: "limits.maxSignatureLifetimeSeconds",
    value: limits?.maxSignatureLifetimeSeconds,
    fallback: DEFAULT_MAX_SIGNATURE_LIFETIME_SECONDS,
    bound: "below",
    minimum: 1n,
  });

  if (fieldErrors.length > 0) {
    throw new SimulationValidationError(
      "Invalid simulation limits",
      fieldErrors,
    );
  }

  return deepFreeze({
    maxSlippageWad,
    minLltvBufferWad,
    maxSignatureLifetimeSeconds,
    operations: limits?.operations ?? [],
  });
}
