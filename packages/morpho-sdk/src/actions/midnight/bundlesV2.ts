import { maxUint128, zeroAddress } from "viem";
import { validateDeadline } from "../../helpers/validate.js";
import {
  DuplicateMidnightGroupCancellationError,
  InputExceedsMaxError,
  type MidnightGroupCancellation,
  NegativeInputError,
} from "../../types/index.js";

/** Blue market argument for `MidnightBundlesV2` calls that park no loan assets. */
export const emptyBlueMarket = {
  loanToken: zeroAddress,
  collateralToken: zeroAddress,
  oracle: zeroAddress,
  irm: zeroAddress,
  lltv: 0n,
} as const;

/** Midnight market argument for `MidnightBundlesV2` calls that supply no collateral. */
export const emptyMidnightMarket = {
  chainId: 0n,
  midnight: zeroAddress,
  loanToken: zeroAddress,
  collateralParams: [],
  maturity: 0n,
  rcfThreshold: 0n,
  enterGate: zeroAddress,
  liquidatorGate: zeroAddress,
} as const;

/** Validates a bundle deadline and group cancellation limits, returning plain copies. */
export const toBundlesV2Cancellations = (params: {
  readonly cancellations: readonly MidnightGroupCancellation[];
  readonly deadline: bigint;
}): MidnightGroupCancellation[] => {
  validateDeadline(params.deadline);
  const groups = new Set<string>();
  return params.cancellations.map(({ group, maxConsumed }, index) => {
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
    return { group, maxConsumed };
  });
};
