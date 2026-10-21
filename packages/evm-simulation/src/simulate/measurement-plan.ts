import type { MarketId } from "@morpho-org/blue-sdk";
import type { Address } from "viem";
import type {
  OperationLimit,
  OperationType,
  SimulationOperationSubject,
} from "../limits.js";

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
      readonly shares: "supplyShares" | "borrowShares" | "collateral";
    }
  | { readonly type: "balance"; readonly token: Address };

interface OperationMeasurementPlan {
  readonly subject: SimulationOperationSubject;
  readonly assetsPaid: AssetMeasurementSource;
  readonly assetsReceived: AssetMeasurementSource;
  readonly sharesMinted?: ShareMeasurementSource;
  readonly sharesBurned?: ShareMeasurementSource;
  readonly collateralSupplied?: ShareMeasurementSource;
  readonly collateralWithdrawn?: ShareMeasurementSource;
}

const market = (
  marketId: MarketId,
  asset: "loan" | "collateral",
): AssetMeasurementSource => ({ type: "market", marketId, asset });
const position = (
  marketId: MarketId,
  shares: "supplyShares" | "borrowShares" | "collateral",
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
      return {
        subject: { operation: limit.type, marketId: limit.marketId },
        assetsPaid: market(limit.marketId, "collateral"),
        assetsReceived: market(limit.marketId, "collateral"),
        collateralSupplied: position(limit.marketId, "collateral"),
      };
    case "blueWithdrawCollateral":
      return {
        subject: { operation: limit.type, marketId: limit.marketId },
        assetsPaid: market(limit.marketId, "collateral"),
        assetsReceived: market(limit.marketId, "collateral"),
        collateralWithdrawn: position(limit.marketId, "collateral"),
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
        collateralSupplied: position(limit.marketId, "collateral"),
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
        collateralWithdrawn: position(limit.marketId, "collateral"),
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

/** The two quote fields that price an operation's conversion, with the adverse direction. @internal */
export interface SharePriceMeasurement {
  readonly assets: "assetsPaid" | "assetsReceived";
  readonly shares: "sharesMinted" | "sharesBurned";
  /** True when a higher realized assets-per-share rate is adverse for the caller. */
  readonly higherIsAdverse: boolean;
}

const PAY_PER_MINTED: SharePriceMeasurement = {
  assets: "assetsPaid",
  shares: "sharesMinted",
  higherIsAdverse: true,
};
const RECEIVE_PER_BURNED: SharePriceMeasurement = {
  assets: "assetsReceived",
  shares: "sharesBurned",
  higherIsAdverse: false,
};
const RECEIVE_PER_DEBT_MINTED: SharePriceMeasurement = {
  assets: "assetsReceived",
  shares: "sharesMinted",
  higherIsAdverse: false,
};
const PAY_PER_DEBT_BURNED: SharePriceMeasurement = {
  assets: "assetsPaid",
  shares: "sharesBurned",
  higherIsAdverse: true,
};

const SHARE_PRICE_MEASUREMENTS = {
  blueSupply: PAY_PER_MINTED,
  blueWithdraw: RECEIVE_PER_BURNED,
  blueSupplyCollateral: null,
  blueBorrow: RECEIVE_PER_DEBT_MINTED,
  blueSupplyCollateralBorrow: RECEIVE_PER_DEBT_MINTED,
  blueRepay: PAY_PER_DEBT_BURNED,
  blueWithdrawCollateral: null,
  blueRepayWithdrawCollateral: PAY_PER_DEBT_BURNED,
  blueRefinance: null,
  vaultV1Deposit: PAY_PER_MINTED,
  vaultV2Deposit: PAY_PER_MINTED,
  vaultV1Withdraw: RECEIVE_PER_BURNED,
  vaultV2Withdraw: RECEIVE_PER_BURNED,
  vaultV1Redeem: RECEIVE_PER_BURNED,
  vaultV2Redeem: RECEIVE_PER_BURNED,
  vaultV2ForceWithdraw: RECEIVE_PER_BURNED,
  vaultV2ForceRedeem: RECEIVE_PER_BURNED,
  vaultV1InKindRedeem: null,
  vaultV2InKindRedeem: null,
  vaultV1MigrateToV2: null,
} as const satisfies Record<OperationType, SharePriceMeasurement | null>;

/**
 * The quote pair a `sharePrice` limit prices for an operation type, or
 * `undefined` when the operation's wallet deltas price no single conversion.
 * @internal
 */
export function sharePriceMeasurement(
  type: OperationType,
): SharePriceMeasurement | undefined {
  return SHARE_PRICE_MEASUREMENTS[type] ?? undefined;
}

/**
 * The market field a `position` bound reads for an operation, or `undefined`
 * when the operation's subject is not a single Blue position.
 * @internal
 */
export function positionBoundsMarketField(
  type: OperationType,
): "marketId" | "targetMarketId" | undefined {
  switch (type) {
    case "blueSupply":
    case "blueWithdraw":
    case "blueSupplyCollateral":
    case "blueBorrow":
    case "blueSupplyCollateralBorrow":
    case "blueRepay":
    case "blueWithdrawCollateral":
    case "blueRepayWithdrawCollateral":
      return "marketId";
    case "blueRefinance":
      return "targetMarketId";
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
    case "vaultV1MigrateToV2":
      return undefined;
    default: {
      const exhaustive: never = type;
      return exhaustive;
    }
  }
}

/**
 * The Blue market a `position` bound reads for an operation, or `undefined`
 * when the operation's subject is not a single Blue position. `blueRefinance`
 * bounds the target market, where the debt lands.
 * @internal
 */
export function positionBoundsMarketId(
  limit: OperationLimit,
): MarketId | undefined {
  const marketField = positionBoundsMarketField(limit.type);
  if (marketField === "marketId")
    return "marketId" in limit ? limit.marketId : undefined;
  if (marketField === "targetMarketId")
    return "targetMarketId" in limit ? limit.targetMarketId : undefined;
  return undefined;
}
