import { type BigIntish, MathLib } from "@morpho-org/blue-sdk";
import { InputExceedsMaxError, NegativeInputError } from "../types/index.js";
import {
  DEFAULT_CAP_ACCRUAL_BUFFER,
  DEFAULT_WITHDRAWAL_TARGET_UTILIZATION,
} from "./constant.js";

/**
 * Resolves and validates the target-market cap-accrual buffer.
 * @internal
 * @param value - Optional buffer duration in seconds.
 * @returns The non-negative buffer duration, defaulting to two hours.
 * @throws {NegativeInputError} when the buffer is negative.
 * @example
 * ```ts
 * const buffer = resolveCapAccrualBuffer(undefined);
 * ```
 */
export const resolveCapAccrualBuffer = (value?: BigIntish) => {
  const buffer = value == null ? DEFAULT_CAP_ACCRUAL_BUFFER : BigInt(value);
  if (buffer < 0n) throw new NegativeInputError("capAccrualBuffer", buffer);
  return buffer;
};

/**
 * Resolves and validates a source withdrawal utilization ceiling.
 * @internal
 * @param value - Optional WAD-scaled utilization ceiling.
 * @param field - Option name reported in validation errors.
 * @returns A ceiling between zero and WAD, defaulting to the shared withdrawal target.
 * @throws {NegativeInputError} when the ceiling is negative.
 * @throws {InputExceedsMaxError} when the ceiling exceeds WAD.
 * @example
 * ```ts
 * const ceiling = resolveMaxWithdrawalUtilization(undefined);
 * ```
 */
export const resolveMaxWithdrawalUtilization = (
  value: bigint | undefined,
  field:
    | "maxWithdrawalUtilization"
    | "defaultMaxWithdrawalUtilization" = "maxWithdrawalUtilization",
) => {
  const utilization = value ?? DEFAULT_WITHDRAWAL_TARGET_UTILIZATION;
  if (utilization < 0n) throw new NegativeInputError(field, utilization);
  if (utilization > MathLib.WAD)
    throw new InputExceedsMaxError({
      field,
      value: utilization,
      max: MathLib.WAD,
    });
  return utilization;
};
