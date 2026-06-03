import { NegativeValueError } from "./errors.js";

/**
 * @internal
 */
export const assertNonNegative = (field: string, value: bigint) => {
  if (value < 0n) throw new NegativeValueError(field, value);
};
