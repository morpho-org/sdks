import type { MarketParams } from "@morpho-org/blue-sdk";
import type { Action } from "@morpho-org/bundler-sdk-viem";
import { validateReallocations } from "../../helpers/index.js";
import type { VaultReallocation } from "../../types/index.js";

/**
 * Builds reallocation bundler actions and computes the total fee.
 *
 * Validates the reallocations, then encodes each as a `reallocateTo` action.
 * Caller must ensure `reallocations` is non-empty before calling.
 *
 * @param reallocations - The vault reallocations to encode.
 * @param targetMarketParams - The target market params for the borrow.
 * @returns The encoded actions and total reallocation fee.
 */
export const buildReallocationActions = (
  reallocations: readonly VaultReallocation[],
  targetMarketParams: MarketParams,
): { readonly actions: Action[]; readonly fee: bigint } => {
  validateReallocations(reallocations, targetMarketParams.id);

  const fee = reallocations.reduce((sum, r) => sum + r.fee, 0n);
  const actions: Action[] = [];

  for (const r of reallocations) {
    actions.push({
      type: "reallocateTo",
      args: [
        r.vault,
        r.fee,
        r.withdrawals.map((w) => ({
          marketParams: w.marketParams,
          amount: w.amount,
        })),
        targetMarketParams,
        false,
      ],
    });
  }

  return { actions, fee };
};
