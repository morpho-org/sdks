import { NegativeValueError } from "./errors.js";

export { deepFreeze } from "@morpho-org/morpho-ts";

/**
 * @internal
 */
export const assertNonNegative = (field: string, value: bigint) => {
  if (value < 0n) throw new NegativeValueError(field, value);
};
