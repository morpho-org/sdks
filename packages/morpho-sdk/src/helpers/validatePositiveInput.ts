import { NonPositiveInputError } from "../types/error.js";

/**
 * Requires a strictly positive input amount.
 *
 * @param field - Input field name used in the error.
 * @param value - Candidate amount.
 * @returns Nothing when the amount is positive.
 * @throws {NonPositiveInputError} when the amount is zero or negative.
 * @internal
 */
export const validatePositiveInput = (field: string, value: bigint): void => {
  if (value <= 0n) throw new NonPositiveInputError(field, value);
};
