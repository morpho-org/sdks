import { getChainAddresses, type MarketParams } from "@morpho-org/blue-sdk";
import type { Action } from "../../bundler/index.js";
import { computeVaultV2ReallocationPenaltyAssets } from "../../helpers/bluePublicAllocator.js";
import { validateReallocations } from "../../helpers/index.js";
import type { BlueReallocation } from "../../types/index.js";

/**
 * Builds Public Allocator V1 and Blue Public Allocator actions and their costs.
 *
 * PublicAllocator V1 entries preserve their `reallocateTo` ABI and validation. Each
 * BluePublicAllocator entry maps 1:1 to either `reallocate` for a market source or
 * `allocateFromIdle` for an idle source. The enclosing Blue action supplies the target market
 * parameters. V2 penalties are pulled once in the target loan token to
 * Bundler3; each allocator action then approves and spends its independently
 * rounded share.
 *
 * @param params - Reallocation encoding inputs.
 * @param params.chainId - Chain where the bundle will execute.
 * @param params.reallocations - PublicAllocator V1 and BluePublicAllocator reallocations in execution order.
 * @param params.targetMarketParams - Target market params derived from the enclosing Blue action.
 * @returns Encoded actions, the native V1 fee, and the V2 loan-token penalty total.
 * @throws {NegativeInputError} when a PublicAllocator V1 fee or BluePublicAllocator penalty is negative.
 * @throws {EmptyReallocationWithdrawalsError} when a PublicAllocator V1 reallocation has no withdrawals.
 * @throws {NonPositiveInputError} when a PublicAllocator V1 withdrawal or BluePublicAllocator asset amount is non-positive.
 * @throws {InputExceedsMaxError} when a BluePublicAllocator asset amount exceeds `uint128` or its penalty exceeds WAD.
 * @throws {InconsistentReallocationPenaltyError} when entries for one allocator-vault pair use different penalties.
 * @throws {InvalidReallocationSourceTypeError} when a BluePublicAllocator source discriminator is unknown.
 * @throws {InvalidReallocationTypeError} when a top-level reallocation variant is unknown.
 * @throws {ReallocationWithdrawalOnTargetMarketError} when a source references the target market.
 * @throws {UnsortedReallocationWithdrawalsError} when PublicAllocator V1 withdrawals are not strictly market-id sorted.
 * @internal
 */
export const buildReallocationActions = ({
  chainId,
  reallocations,
  targetMarketParams,
}: {
  readonly chainId: number;
  readonly reallocations: readonly BlueReallocation[];
  readonly targetMarketParams: MarketParams;
}): {
  readonly actions: Action[];
  readonly fee: bigint;
  readonly penaltyAssets: bigint;
} => {
  // Validate the action descriptors before encoding; the validator returns void.
  validateReallocations(reallocations, targetMarketParams.id);

  let fee = 0n;
  const actions: Action[] = [];
  const penaltyAssets = computeVaultV2ReallocationPenaltyAssets(reallocations);

  if (penaltyAssets > 0n) {
    const {
      bundler3: { bundler3 },
    } = getChainAddresses(chainId);
    actions.push({
      type: "erc20TransferFrom",
      args: [targetMarketParams.loanToken, penaltyAssets, bundler3, false],
    });
  }

  for (const reallocation of reallocations) {
    if (reallocation.type === "bluePublicAllocator") {
      if (reallocation.from.type === "market") {
        actions.push({
          type: "vaultV2BluePublicAllocatorReallocate",
          args: [
            reallocation.allocator,
            reallocation.vault,
            reallocation.from.adapter,
            reallocation.from.marketParams,
            reallocation.to.adapter,
            targetMarketParams,
            reallocation.assets,
            reallocation.penalty,
            false,
          ],
        });
      } else {
        actions.push({
          type: "vaultV2BluePublicAllocatorAllocateFromIdle",
          args: [
            reallocation.allocator,
            reallocation.vault,
            reallocation.to.adapter,
            targetMarketParams,
            reallocation.assets,
            reallocation.penalty,
            false,
          ],
        });
      }
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

  return { actions, fee, penaltyAssets };
};
