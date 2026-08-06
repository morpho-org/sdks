import type { MarketParams } from "@morpho-org/blue-sdk";
import type { Action } from "../../bundler/index.js";
import { validateReallocations } from "../../helpers/index.js";
import type { BlueReallocation } from "../../types/index.js";

/**
 * Builds V1 and Blue Public Allocator V2 reallocation actions and computes their native cost.
 *
 * V1 entries preserve their `reallocateTo` ABI and validation. Each V2 entry maps 1:1 to either
 * `reallocate` for a market source or `allocateFromIdle` for an idle source. The enclosing Blue
 * action supplies the target market parameters.
 *
 * @param reallocations - V1 and V2 reallocations in execution order.
 * @param targetMarketParams - Target market params derived from the enclosing Blue action.
 * @returns Encoded actions and the sum of V1 fees plus V2 native penalties.
 * @throws {NegativeInputError} when a V1 fee or V2 native penalty is negative.
 * @throws {EmptyReallocationWithdrawalsError} when a V1 reallocation has no withdrawals.
 * @throws {NonPositiveInputError} when a V1 withdrawal or V2 asset amount is non-positive.
 * @throws {InputExceedsMaxError} when a V2 asset amount exceeds `uint128`.
 * @throws {InvalidReallocationSourceTypeError} when a V2 source discriminator is unknown.
 * @throws {ReallocationWithdrawalOnTargetMarketError} when a source references the target market.
 * @throws {UnsortedReallocationWithdrawalsError} when V1 withdrawals are not strictly market-id sorted.
 * @internal
 */
export const buildReallocationActions = (
  reallocations: readonly BlueReallocation[],
  targetMarketParams: MarketParams,
): { readonly actions: Action[]; readonly fee: bigint } => {
  validateReallocations(reallocations, targetMarketParams.id);

  let fee = 0n;
  const actions: Action[] = [];

  for (const reallocation of reallocations) {
    if ("type" in reallocation && reallocation.type === "publicAllocatorV2") {
      if (reallocation.from.type === "market") {
        actions.push({
          type: "bluePublicAllocatorV2Reallocate",
          args: [
            reallocation.allocator,
            reallocation.vault,
            reallocation.from.adapter,
            reallocation.from.marketParams,
            reallocation.to.adapter,
            targetMarketParams,
            reallocation.assets,
            reallocation.nativePenalty,
            false,
          ],
        });
      } else {
        actions.push({
          type: "bluePublicAllocatorV2AllocateFromIdle",
          args: [
            reallocation.allocator,
            reallocation.vault,
            reallocation.to.adapter,
            targetMarketParams,
            reallocation.assets,
            reallocation.nativePenalty,
            false,
          ],
        });
      }
      fee += reallocation.nativePenalty;
      continue;
    }

    if (!("withdrawals" in reallocation)) continue;

    actions.push({
      type: "reallocateTo",
      args: [
        reallocation.vault,
        reallocation.fee,
        reallocation.withdrawals.map((withdrawal) => ({
          marketParams: withdrawal.marketParams,
          amount: withdrawal.amount,
        })),
        targetMarketParams,
        false,
      ],
    });
    fee += reallocation.fee;
  }

  return { actions, fee };
};
