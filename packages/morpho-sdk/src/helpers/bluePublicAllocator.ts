import { MathLib } from "@morpho-org/blue-sdk";
import type { VaultV2BlueReallocation } from "../types/index.js";

/**
 * Sums the independently rounded vault-asset penalties in a Vault V2 plan.
 *
 * Each call is rounded independently, matching contract execution.
 *
 * @param reallocations - Vault V2 BluePublicAllocator plan.
 * @returns Total target loan-token assets needed for V2 penalties.
 * @example
 * ```ts
 * const penaltyAssets = computeVaultV2BlueReallocationPenaltyAssets(reallocations);
 * ```
 * @internal
 */
export const computeVaultV2BlueReallocationPenaltyAssets = (
  reallocations: Iterable<VaultV2BlueReallocation>,
) => {
  let total = 0n;
  for (const reallocation of reallocations) {
    total += MathLib.wMulUp(reallocation.assets, reallocation.penalty);
  }
  return total;
};
