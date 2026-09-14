import { maxUint256 } from "viem";
import { InputExceedsMaxError, NonPositiveInputError } from "../types/index.js";

/**
 * Validates that an in-kind exit or permit deadline is a positive ABI uint256.
 * @internal
 * @param deadline - Deadline in seconds.
 * @returns The validated deadline.
 * @throws {NonPositiveInputError} when the deadline is not positive.
 * @throws {InputExceedsMaxError} when the deadline exceeds uint256.
 * @example
 * ```ts
 * const deadline = validateInKindDeadline(1_800_000_000n);
 * ```
 */
export const validateInKindDeadline = (deadline: bigint): bigint => {
  if (deadline <= 0n) throw new NonPositiveInputError("deadline", deadline);
  if (deadline > maxUint256)
    throw new InputExceedsMaxError({
      field: "deadline",
      value: deadline,
      max: maxUint256,
    });
  return deadline;
};
