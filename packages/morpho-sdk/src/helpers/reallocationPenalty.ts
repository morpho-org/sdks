import {
  InputExceedsMaxError,
  InvalidBigIntInputError,
  NegativeInputError,
} from "../types/error.js";
import {
  DEFAULT_MAX_REALLOCATION_PENALTY,
  MAX_REALLOCATION_PENALTY,
} from "./constant.js";

/**
 * Resolves an omitted reallocation penalty bound and validates its runtime type and range.
 * @param value - Optional WAD-scaled penalty bound.
 * @returns A bigint in [0, WAD], defaulting only undefined to zero.
 * @throws {InvalidBigIntInputError} when a supplied bound is not a bigint.
 * @throws {NegativeInputError} when the bound is negative.
 * @throws {InputExceedsMaxError} when the bound exceeds WAD.
 * @internal
 */
export const resolveMaxPenalty = (value: unknown): bigint => {
  const penalty =
    value === undefined ? DEFAULT_MAX_REALLOCATION_PENALTY : value;
  if (typeof penalty !== "bigint") {
    throw new InvalidBigIntInputError("maxPenalty", penalty);
  }
  if (penalty < 0n) {
    throw new NegativeInputError("maxPenalty", penalty);
  }
  if (penalty > MAX_REALLOCATION_PENALTY) {
    throw new InputExceedsMaxError({
      field: "maxPenalty",
      value: penalty,
      max: MAX_REALLOCATION_PENALTY,
    });
  }
  return penalty;
};
