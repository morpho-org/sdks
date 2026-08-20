import {
  getChainAddresses,
  type MarketParams,
  VaultV2BluePublicAllocatorConfigUtils,
} from "@morpho-org/blue-sdk";
import type { Action } from "../../bundler/index.js";
import { validateAndNormalizeReallocations } from "../../helpers/validate.js";
import type {
  BlueReallocationPlan,
  VaultV1Reallocation,
  VaultV2BlueReallocation,
} from "../../types/index.js";

/**
 * Builds PublicAllocator V1 reallocation actions for a Morpho Blue target market.
 *
 * Preserves the supplied reallocation order and aggregates each allocator call's native fee.
 *
 * @param params.reallocations - Validated Vault V1 reallocations to execute.
 * @param params.targetMarketParams - Morpho Blue market receiving the reallocated liquidity.
 * @returns The reallocation actions and aggregate native fee, with zero V2 penalty assets.
 * @internal
 */
export const buildVaultV1ReallocationActions = ({
  reallocations,
  targetMarketParams,
}: {
  readonly reallocations: readonly VaultV1Reallocation[];
  readonly targetMarketParams: MarketParams;
}) => {
  let fee = 0n;
  const actions: Action[] = [];

  for (const reallocation of reallocations) {
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

  return { actions, fee, penaltyAssets: 0n };
};

/**
 * Builds BluePublicAllocator reallocation actions for a Morpho Blue target market.
 *
 * Prepends one aggregate loan-token funding action when penalties are non-zero, then builds one
 * allocator action per validated Vault V2 reallocation.
 *
 * @param params.chainId - Chain whose registered Bundler3 and allocator addresses are used.
 * @param params.reallocations - Validated Vault V2 Blue reallocations to execute.
 * @param params.targetMarketParams - Morpho Blue market receiving the reallocated liquidity.
 * @param params.penaltyFundingSource - Optional source of penalty assets. Defaults to the
 *   transaction initiator.
 * @returns The funding and reallocation actions and aggregate penalty assets, with zero native fee.
 * @internal
 */
export const buildVaultV2BlueReallocationActions = ({
  chainId,
  reallocations,
  targetMarketParams,
  penaltyFundingSource = "initiator",
}: {
  readonly chainId: number;
  readonly reallocations: readonly VaultV2BlueReallocation[];
  readonly targetMarketParams: MarketParams;
  readonly penaltyFundingSource?: "initiator" | "generalAdapter1";
}) => {
  const actions: Action[] = [];
  const penaltyAssets = reallocations.reduce(
    (total, reallocation) =>
      total +
      VaultV2BluePublicAllocatorConfigUtils.getPenaltyAssets(
        reallocation,
        reallocation.assets,
      ),
    0n,
  );

  if (penaltyAssets > 0n) {
    const {
      bundler3: { bundler3, generalAdapter1 },
    } = getChainAddresses(chainId);
    actions.push(
      penaltyFundingSource === "generalAdapter1"
        ? {
            type: "erc20Transfer",
            args: [
              targetMarketParams.loanToken,
              bundler3,
              penaltyAssets,
              generalAdapter1,
              false,
            ],
          }
        : {
            type: "erc20TransferFrom",
            args: [
              targetMarketParams.loanToken,
              penaltyAssets,
              bundler3,
              false,
            ],
          },
    );
  }

  for (const reallocation of reallocations) {
    actions.push(
      reallocation.from.type === "market"
        ? {
            type: "vaultV2BluePublicAllocatorReallocate",
            args: [
              reallocation.vault,
              reallocation.from.adapter,
              reallocation.from.marketParams,
              reallocation.to.adapter,
              targetMarketParams,
              reallocation.assets,
              reallocation.penalty,
              false,
            ],
          }
        : {
            type: "vaultV2BluePublicAllocatorAllocateFromIdle",
            args: [
              reallocation.vault,
              reallocation.to.adapter,
              targetMarketParams,
              reallocation.assets,
              reallocation.penalty,
              false,
            ],
          },
    );
  }

  return { actions, fee: 0n, penaltyAssets };
};

/**
 * Validates a homogeneous Blue reallocation plan and builds its Bundler actions.
 *
 * Dispatches Vault V1 and Vault V2 plans to their version-specific builders. V1 plans aggregate
 * native fees, while V2 plans aggregate loan-token penalties using the selected funding source.
 *
 * @param params.chainId - Chain whose registered Bundler3 and allocator addresses are used.
 * @param params.reallocations - Optional homogeneous Vault V1 or Vault V2 reallocation plan.
 * @param params.targetMarketParams - Morpho Blue market receiving the reallocated liquidity.
 * @param params.penaltyFundingSource - Optional source of V2 penalty assets. Defaults to the
 *   transaction initiator.
 * @returns The reallocation actions, aggregate V1 native fee, and aggregate V2 penalty assets.
 * @internal
 */
export const buildBlueReallocationActions = ({
  chainId,
  reallocations,
  targetMarketParams,
  penaltyFundingSource,
}: {
  readonly chainId: number;
  readonly reallocations: BlueReallocationPlan | undefined;
  readonly targetMarketParams: MarketParams;
  readonly penaltyFundingSource?: "initiator" | "generalAdapter1";
}) => {
  const reallocationPlan = validateAndNormalizeReallocations(
    reallocations,
    targetMarketParams.id,
  );

  return reallocationPlan.type === "vaultV1"
    ? buildVaultV1ReallocationActions({
        reallocations: reallocationPlan.reallocations,
        targetMarketParams,
      })
    : buildVaultV2BlueReallocationActions({
        chainId,
        reallocations: reallocationPlan.reallocations,
        targetMarketParams,
        penaltyFundingSource,
      });
};
