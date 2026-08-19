import {
  getChainAddresses,
  type MarketParams,
  VaultV2BluePublicAllocatorConfigUtils,
} from "@morpho-org/blue-sdk";
import type { Action } from "../../bundler/index.js";
import type {
  VaultV1Reallocation,
  VaultV2BlueReallocation,
} from "../../types/index.js";

/** @internal */
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

/** @internal */
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
