import { type BigIntish, MathLib } from "@morpho-org/blue-sdk";
import { InputExceedsMaxError, NegativeInputError } from "../types/index.js";
import {
  DEFAULT_ALLOCATOR_CAP_HEADROOM,
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
 * Resolves and validates the BluePublicAllocator cap headroom share.
 * @internal
 * @param value - Optional WAD-scaled share of the allocator cap.
 * @returns A share between zero and WAD, defaulting to 1%.
 * @throws {NegativeInputError} when the share is negative.
 * @throws {InputExceedsMaxError} when the share exceeds WAD.
 * @example
 * ```ts
 * const headroom = resolveAllocatorCapHeadroom(undefined);
 * ```
 */
export const resolveAllocatorCapHeadroom = (value?: bigint) => {
  const headroom = value ?? DEFAULT_ALLOCATOR_CAP_HEADROOM;
  if (headroom < 0n)
    throw new NegativeInputError("allocatorCapHeadroom", headroom);
  if (headroom > MathLib.WAD)
    throw new InputExceedsMaxError({
      field: "allocatorCapHeadroom",
      value: headroom,
      max: MathLib.WAD,
    });
  return headroom;
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
