import { maxUint128, zeroAddress } from "viem";
import {
  DuplicateMidnightGroupCancellationError,
  InputExceedsMaxError,
  type MidnightGroupCancellation,
  NegativeInputError,
} from "../../types/index.js";

/** @internal Blue market placeholder for MidnightBundlesV2 calls that park no assets. */
export const emptyBlueMarket = {
  loanToken: zeroAddress,
  collateralToken: zeroAddress,
  oracle: zeroAddress,
  irm: zeroAddress,
  lltv: 0n,
} as const;

/**
 * @internal Validates `{ group, maxConsumed }` cancellations and returns plain copies for encoding.
 *
 * @throws {NegativeInputError} when a `maxConsumed` ceiling is negative.
 * @throws {InputExceedsMaxError} when a `maxConsumed` ceiling exceeds `uint128`.
 * @throws {DuplicateMidnightGroupCancellationError} when a group appears more than once.
 */
export const validateGroupCancellations = (
  cancellations: readonly MidnightGroupCancellation[],
): MidnightGroupCancellation[] => {
  const groups = new Set<string>();
  for (const [index, { group, maxConsumed }] of cancellations.entries()) {
    const field = `cancellations[${index}].maxConsumed`;
    if (maxConsumed < 0n) throw new NegativeInputError(field, maxConsumed);
    if (maxConsumed > maxUint128) {
      throw new InputExceedsMaxError({
        field,
        value: maxConsumed,
        max: maxUint128,
      });
    }
    const key = group.toLowerCase();
    if (groups.has(key)) {
      throw new DuplicateMidnightGroupCancellationError({ index, group });
    }
    groups.add(key);
  }

  return cancellations.map(({ group, maxConsumed }) => ({
    group,
    maxConsumed,
  }));
};
