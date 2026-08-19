import { MathLib } from "@morpho-org/blue-sdk";
import type { BlueReallocation } from "../types/index.js";

/**
 * Sums the independently rounded vault-asset penalties in a mixed V1/V2 plan.
 *
 * PublicAllocator V1 entries are ignored because their fees are paid in native
 * token. Each V2 call is rounded independently, matching contract execution.
 *
 * @param reallocations - Mixed PublicAllocator V1 and BluePublicAllocator plan.
 * @returns Total target loan-token assets needed for V2 penalties.
 * @example
 * ```ts
 * const penaltyAssets = computeVaultV2BlueReallocationPenaltyAssets(reallocations);
 * ```
 * @internal
 */
export const computeVaultV2BlueReallocationPenaltyAssets = (
  reallocations: Iterable<BlueReallocation>,
) => {
  let total = 0n;
  for (const reallocation of reallocations) {
    if ("from" in reallocation)
      total += MathLib.wMulUp(reallocation.assets, reallocation.penalty);
  }
  return total;
};
