import type { MarketParams } from "@morpho-org/blue-sdk";
import type { Action } from "../../bundler/index.js";
import { validateReallocations } from "../../helpers/index.js";
import type { VaultReallocation } from "../../types/index.js";

/**
 * Builds reallocation bundler actions and computes the total fee.
 *
 * Validates the reallocations, then encodes each as a `reallocateTo` action against the target
 * market. Returns `{ actions: [], fee: 0n }` for an empty input — callers gate on
 * `reallocations.length > 0` and skip the call entirely in that case. Internal helper —
 * consumed only by `blueBorrow` and `blueSupplyCollateralBorrow`; not re-exported on the
 * public surface.
 *
 * @param reallocations - The vault reallocations to encode.
 * @param targetMarketParams - The target market params the freed liquidity is destined for.
 * @returns The encoded `reallocateTo` actions and the summed reallocation fee in native tokens.
 * @throws {NegativeReallocationFeeError} when any reallocation fee is negative.
 * @throws {EmptyReallocationWithdrawalsError} when any reallocation has no withdrawals.
 * @throws {NonPositiveReallocationAmountError} when any withdrawal amount is non-positive.
 * @throws {ReallocationWithdrawalOnTargetMarketError} when a withdrawal references the target market.
 * @throws {UnsortedReallocationWithdrawalsError} when withdrawals within a reallocation are not
 *   strictly sorted by market id.
 * @internal
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
