import type { MarketParams } from "@morpho-org/blue-sdk";
import type { Action } from "../../bundler/index.js";
import { validateReallocations } from "../../helpers/index.js";
import type { BlueReallocation } from "../../types/index.js";

/**
 * Builds Public Allocator V1 and Blue Public Allocator actions and computes their native cost.
 *
 * PublicAllocator V1 entries preserve their `reallocateTo` ABI and validation. Each
 * BluePublicAllocator entry maps 1:1 to either `reallocate` for a market source or
 * `allocateFromIdle` for an idle source. The enclosing Blue action supplies the target market
 * parameters.
 *
 * @param reallocations - PublicAllocator V1 and BluePublicAllocator reallocations in execution order.
 * @param targetMarketParams - Target market params derived from the enclosing Blue action.
 * @returns Encoded actions and the sum of PublicAllocator V1 fees plus BluePublicAllocator native penalties.
 * @throws {NegativeInputError} when a PublicAllocator V1 fee or BluePublicAllocator native penalty is negative.
 * @throws {EmptyReallocationWithdrawalsError} when a PublicAllocator V1 reallocation has no withdrawals.
 * @throws {NonPositiveInputError} when a PublicAllocator V1 withdrawal or BluePublicAllocator asset amount is non-positive.
 * @throws {InputExceedsMaxError} when a BluePublicAllocator asset amount exceeds `uint128`.
 * @throws {InvalidReallocationSourceTypeError} when a BluePublicAllocator source discriminator is unknown.
 * @throws {InvalidReallocationTypeError} when a top-level reallocation variant is unknown.
 * @throws {ReallocationWithdrawalOnTargetMarketError} when a source references the target market.
 * @throws {UnsortedReallocationWithdrawalsError} when PublicAllocator V1 withdrawals are not strictly market-id sorted.
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
    if (reallocation.type === "bluePublicAllocator") {
      if (reallocation.from.type === "market") {
        actions.push({
          type: "bluePublicAllocatorReallocate",
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
          type: "bluePublicAllocatorAllocateFromIdle",
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
