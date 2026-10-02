import type { MarketId } from "@morpho-org/blue-sdk";
import type { Address } from "viem";
import type { OperationLimit, SimulationOperationSubject } from "../limits.js";

type AssetMeasurementSource =
  | {
      readonly type: "market";
      readonly marketId: MarketId;
      readonly asset: "loan" | "collateral";
    }
  | { readonly type: "vault"; readonly vault: Address };

type ShareMeasurementSource =
  | {
      readonly type: "position";
      readonly marketId: MarketId;
      readonly shares: "supplyShares" | "borrowShares";
    }
  | { readonly type: "balance"; readonly token: Address };

interface OperationMeasurementPlan {
  readonly subject: SimulationOperationSubject;
  readonly assetsPaid: AssetMeasurementSource;
  readonly assetsReceived: AssetMeasurementSource;
  readonly sharesMinted?: ShareMeasurementSource;
  readonly sharesBurned?: ShareMeasurementSource;
}

const market = (
  marketId: MarketId,
  asset: "loan" | "collateral",
): AssetMeasurementSource => ({ type: "market", marketId, asset });
const position = (
  marketId: MarketId,
  shares: "supplyShares" | "borrowShares",
): ShareMeasurementSource => ({ type: "position", marketId, shares });
const balance = (token: Address): ShareMeasurementSource => ({
  type: "balance",
  token,
});
const vault = (address: Address): AssetMeasurementSource => ({
  type: "vault",
  vault: address,
});

/** Describe each quote field's evidence source with an exhaustive operation switch. @internal */
export function operationMeasurementPlan(
  limit: OperationLimit,
): OperationMeasurementPlan {
  switch (limit.type) {
    case "blueSupply":
    case "blueWithdraw": {
      const shares = position(limit.marketId, "supplyShares");
      return {
        subject: { operation: limit.type, marketId: limit.marketId },
        assetsPaid: market(limit.marketId, "loan"),
        assetsReceived: market(limit.marketId, "loan"),
        sharesMinted: shares,
        sharesBurned: shares,
      };
    }
    case "blueSupplyCollateral":
    case "blueWithdrawCollateral":
      return {
        subject: { operation: limit.type, marketId: limit.marketId },
        assetsPaid: market(limit.marketId, "collateral"),
        assetsReceived: market(limit.marketId, "collateral"),
      };
    case "blueBorrow":
    case "blueRepay": {
      const shares = position(limit.marketId, "borrowShares");
      return {
        subject: { operation: limit.type, marketId: limit.marketId },
        assetsPaid: market(limit.marketId, "loan"),
        assetsReceived: market(limit.marketId, "loan"),
        sharesMinted: shares,
        sharesBurned: shares,
      };
    }
    case "blueSupplyCollateralBorrow": {
      const shares = position(limit.marketId, "borrowShares");
      return {
        subject: { operation: limit.type, marketId: limit.marketId },
        assetsPaid: market(limit.marketId, "collateral"),
        assetsReceived: market(limit.marketId, "loan"),
        sharesMinted: shares,
        sharesBurned: shares,
      };
    }
    case "blueRepayWithdrawCollateral": {
      const shares = position(limit.marketId, "borrowShares");
      return {
        subject: { operation: limit.type, marketId: limit.marketId },
        assetsPaid: market(limit.marketId, "loan"),
        assetsReceived: market(limit.marketId, "collateral"),
        sharesMinted: shares,
        sharesBurned: shares,
      };
    }
    case "blueRefinance":
      return {
        subject: {
          operation: limit.type,
          sourceMarketId: limit.sourceMarketId,
          targetMarketId: limit.targetMarketId,
        },
        assetsPaid: market(limit.sourceMarketId, "loan"),
        assetsReceived: market(limit.sourceMarketId, "loan"),
        sharesMinted: position(limit.targetMarketId, "borrowShares"),
        sharesBurned: position(limit.sourceMarketId, "borrowShares"),
      };
    case "vaultV1Deposit":
    case "vaultV2Deposit":
    case "vaultV1Withdraw":
    case "vaultV2Withdraw":
    case "vaultV1Redeem":
    case "vaultV2Redeem":
    case "vaultV2ForceWithdraw":
    case "vaultV2ForceRedeem":
    case "vaultV1InKindRedeem":
    case "vaultV2InKindRedeem":
      return {
        subject: {
          operation: limit.type,
          vault: limit.vault,
        },
        assetsPaid: vault(limit.vault),
        assetsReceived: vault(limit.vault),
        sharesMinted: balance(limit.vault),
        sharesBurned: balance(limit.vault),
      };
    case "vaultV1MigrateToV2":
      return {
        subject: {
          operation: limit.type,
          sourceVault: limit.sourceVault,
          targetVault: limit.targetVault,
        },
        assetsPaid: vault(limit.sourceVault),
        assetsReceived: vault(limit.sourceVault),
        sharesMinted: balance(limit.targetVault),
        sharesBurned: balance(limit.sourceVault),
      };
    default: {
      const exhaustive: never = limit;
      return exhaustive;
    }
  }
}
