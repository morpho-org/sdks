import { MathLib } from "@morpho-org/blue-sdk";
import { InputExceedsMaxError, NegativeInputError } from "../types/index.js";
import { DEFAULT_WITHDRAWAL_TARGET_UTILIZATION } from "./constant.js";

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
