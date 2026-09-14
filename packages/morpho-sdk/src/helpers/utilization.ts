import { type MarketId, MathLib } from "@morpho-org/blue-sdk";
import type { ReallocationComputeOptions } from "../types/index.js";
import { InputExceedsMaxError, NegativeInputError } from "../types/index.js";
import {
  DEFAULT_SUPPLY_TARGET_UTILIZATION,
  DEFAULT_WITHDRAWAL_TARGET_UTILIZATION,
} from "./constant.js";

/**
 * Resolves the effective supply target utilization for a market: the per-market
 * override, then the global default override, then
 * {@link DEFAULT_SUPPLY_TARGET_UTILIZATION}.
 *
 * @param marketId - The market whose supply target utilization to resolve.
 * @param options - Reallocation options carrying the per-market and default overrides.
 * @returns The supply target utilization, scaled by WAD.
 */
export const getSupplyTargetUtilization = (
  marketId: MarketId,
  options?: ReallocationComputeOptions,
): bigint =>
  options?.supplyTargetUtilization?.[marketId] ??
  options?.defaultSupplyTargetUtilization ??
  DEFAULT_SUPPLY_TARGET_UTILIZATION;

/**
 * Resolves and validates a source withdrawal utilization ceiling.
 * @internal
 * @param value - Optional WAD-scaled utilization ceiling.
 * @returns A ceiling between zero and WAD, defaulting to the shared withdrawal target.
 * @throws {NegativeInputError} when the ceiling is negative.
 * @throws {InputExceedsMaxError} when the ceiling exceeds WAD.
 * @example
 * ```ts
 * const ceiling = resolveMaxWithdrawalUtilization(undefined);
 * ```
 */
export const resolveMaxWithdrawalUtilization = (value: bigint | undefined) => {
  const utilization = value ?? DEFAULT_WITHDRAWAL_TARGET_UTILIZATION;
  if (utilization < 0n)
    throw new NegativeInputError("maxWithdrawalUtilization", utilization);
  if (utilization > MathLib.WAD)
    throw new InputExceedsMaxError({
      field: "maxWithdrawalUtilization",
      value: utilization,
      max: MathLib.WAD,
    });
  return utilization;
};
