import type { MarketId } from "@morpho-org/blue-sdk";
import type { Address } from "viem";

/** Every operation type; source of `OperationType`. */
export const OPERATION_TYPES = [
  "blueSupply",
  "blueWithdraw",
  "blueSupplyCollateral",
  "blueBorrow",
  "blueSupplyCollateralBorrow",
  "blueRepay",
  "blueWithdrawCollateral",
  "blueRepayWithdrawCollateral",
  "blueRefinance",
  "blueAuthorization",
  "vaultV1Deposit",
  "vaultV2Deposit",
  "vaultV1Withdraw",
  "vaultV2Withdraw",
  "vaultV1Redeem",
  "vaultV2Redeem",
  "vaultV2ForceWithdraw",
  "vaultV2ForceRedeem",
  "vaultV1InKindRedeem",
  "vaultV2InKindRedeem",
  "vaultV1MigrateToV2",
] as const;

/** Discriminator for operations and their limits. */
export type OperationType = (typeof OPERATION_TYPES)[number];

/** Operations acting on one Blue market; source of `BlueMarketOperationType`. */
export const BLUE_MARKET_OPERATION_TYPES = [
  "blueSupply",
  "blueWithdraw",
  "blueSupplyCollateral",
  "blueBorrow",
  "blueSupplyCollateralBorrow",
  "blueRepay",
  "blueWithdrawCollateral",
  "blueRepayWithdrawCollateral",
] as const satisfies readonly OperationType[];

/** Operations acting on one Blue market. */
export type BlueMarketOperationType =
  (typeof BLUE_MARKET_OPERATION_TYPES)[number];

/** Operations acting on one vault (V1 or V2); source of `VaultOperationType`. */
export const VAULT_OPERATION_TYPES = [
  "vaultV1Deposit",
  "vaultV2Deposit",
  "vaultV1Withdraw",
  "vaultV2Withdraw",
  "vaultV1Redeem",
  "vaultV2Redeem",
  "vaultV2ForceWithdraw",
  "vaultV2ForceRedeem",
  "vaultV1InKindRedeem",
  "vaultV2InKindRedeem",
] as const satisfies readonly OperationType[];

/** Operations acting on one vault (V1 or V2). */
export type VaultOperationType = (typeof VAULT_OPERATION_TYPES)[number];

/** Subject of an operation acting on one Blue market. */
export interface BlueMarketOperationSubject {
  readonly operation: BlueMarketOperationType;
  /** Blue market the operation acts on. */
  readonly marketId: MarketId;
}

/** Subject of a Blue refinance between two markets. */
export interface BlueRefinanceSubject {
  readonly operation: "blueRefinance";
  /** Market the refinance closes. */
  readonly sourceMarketId: MarketId;
  /** Market the refinance opens. */
  readonly targetMarketId: MarketId;
}

/** Subject of a Morpho authorization change. */
export interface BlueAuthorizationSubject {
  readonly operation: "blueAuthorization";
  /** Operator whose Morpho authorization the operation sets. */
  readonly authorized: Address;
}

/** Subject of an operation acting on one vault (V1 or V2). */
export interface VaultOperationSubject {
  readonly operation: VaultOperationType;
  /** Vault the operation acts on. */
  readonly vault: Address;
  /** Vault V2 adapter the operation routes through. */
  readonly adapter?: Address;
}

/** Subject of a Vault V1 → V2 migration. */
export interface VaultV1MigrateToV2Subject {
  readonly operation: "vaultV1MigrateToV2";
  /** Vault the migration exits. */
  readonly sourceVault: Address;
  /** Vault the migration enters. */
  readonly targetVault: Address;
}

/** Protocol entity the failing operation acts on, keyed by `operation`. */
export type SimulationOperationSubject =
  | BlueMarketOperationSubject
  | BlueRefinanceSubject
  | BlueAuthorizationSubject
  | VaultOperationSubject
  | VaultV1MigrateToV2Subject;

/** Caller-quoted net amounts in raw units over the whole bundle.
 * Supply at least one amount. Unquoted amounts are not checked.
 */
export interface SlippageQuote {
  /**
   * Expected net assets credited to the receiver. For in-kind vault redemptions,
   * this measures only the wallet balance of the vault asset, not Morpho positions.
   */
  readonly assetsReceived?: bigint;
  /**
   * Expected net shares added to the position. For debt shares, this is a
   * maximum: minting more debt shares than quoted is adverse.
   */
  readonly sharesMinted?: bigint;
  /** Expected net assets debited from the sender. */
  readonly assetsPaid?: bigint;
  /**
   * Expected net shares removed from the position. For debt shares, this is a
   * minimum: burning fewer debt shares than quoted is adverse.
   */
  readonly sharesBurned?: bigint;
}

/** Caller quote and permitted adverse percentage deviation. */
export interface SlippageLimits {
  readonly quote: SlippageQuote;
  /** WAD-scaled fraction from 0 to 1e18 inclusive; 1e16 means 1%. No default. */
  readonly slippageTolerance: bigint;
}

/** Caller-selected action and subject with the same quote/tolerance shape for every action.
 * Measurements cover the entire bundle for the named subject, never an inferred
 * individual transaction. Use separate simulations for per-transaction bounds.
 */
export type OperationLimit = SlippageLimits & {
  /** Position/share owner; defaults to the transaction sender. */
  readonly account?: Address;
  /** Explicit asset paid; defaults to the action underlying. */
  readonly assetPaid?: Address;
  /** Explicit asset received; defaults to the action underlying. */
  readonly assetReceived?: Address;
  /** Asset receiver; defaults to the transaction sender. */
  readonly receiver?: Address;
} & (
    | { readonly type: BlueMarketOperationType; readonly marketId: MarketId }
    | {
        readonly type: "blueRefinance";
        readonly sourceMarketId: MarketId;
        readonly targetMarketId: MarketId;
      }
    | {
        readonly type: VaultOperationType;
        readonly vault: Address;
        readonly adapter?: Address;
      }
    | {
        readonly type: "vaultV1MigrateToV2";
        readonly sourceVault: Address;
        readonly targetVault: Address;
      }
  );

/** Optional caller-selected checks. No action discovery or default bounds. */
export interface SimulationLimits {
  readonly operations?: readonly OperationLimit[];
}

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

/** Quote-field sources for one operation. @internal */
export interface OperationMeasurementPlan {
  readonly subject: SimulationOperationSubject;
  readonly assetsPaid: AssetMeasurementSource;
  readonly assetsReceived: AssetMeasurementSource;
  readonly sharesMinted?: ShareMeasurementSource;
  readonly sharesBurned?: ShareMeasurementSource;
}

/** Describe each quote field's evidence source with an exhaustive operation switch. @internal */
export function operationMeasurementPlan(
  limit: OperationLimit,
): OperationMeasurementPlan {
  switch (limit.type) {
    case "blueSupply":
    case "blueWithdraw":
      return {
        subject: { operation: limit.type, marketId: limit.marketId },
        assetsPaid: {
          type: "market",
          marketId: limit.marketId,
          asset: "loan",
        },
        assetsReceived: {
          type: "market",
          marketId: limit.marketId,
          asset: "loan",
        },
        sharesMinted: {
          type: "position",
          marketId: limit.marketId,
          shares: "supplyShares",
        },
        sharesBurned: {
          type: "position",
          marketId: limit.marketId,
          shares: "supplyShares",
        },
      };
    case "blueSupplyCollateral":
    case "blueWithdrawCollateral":
      return {
        subject: { operation: limit.type, marketId: limit.marketId },
        assetsPaid: {
          type: "market",
          marketId: limit.marketId,
          asset: "collateral",
        },
        assetsReceived: {
          type: "market",
          marketId: limit.marketId,
          asset: "collateral",
        },
      };
    case "blueBorrow":
    case "blueRepay":
      return {
        subject: { operation: limit.type, marketId: limit.marketId },
        assetsPaid: {
          type: "market",
          marketId: limit.marketId,
          asset: "loan",
        },
        assetsReceived: {
          type: "market",
          marketId: limit.marketId,
          asset: "loan",
        },
        sharesMinted: {
          type: "position",
          marketId: limit.marketId,
          shares: "borrowShares",
        },
        sharesBurned: {
          type: "position",
          marketId: limit.marketId,
          shares: "borrowShares",
        },
      };
    case "blueSupplyCollateralBorrow":
      return {
        subject: { operation: limit.type, marketId: limit.marketId },
        assetsPaid: {
          type: "market",
          marketId: limit.marketId,
          asset: "collateral",
        },
        assetsReceived: {
          type: "market",
          marketId: limit.marketId,
          asset: "loan",
        },
        sharesMinted: {
          type: "position",
          marketId: limit.marketId,
          shares: "borrowShares",
        },
        sharesBurned: {
          type: "position",
          marketId: limit.marketId,
          shares: "borrowShares",
        },
      };
    case "blueRepayWithdrawCollateral":
      return {
        subject: { operation: limit.type, marketId: limit.marketId },
        assetsPaid: {
          type: "market",
          marketId: limit.marketId,
          asset: "loan",
        },
        assetsReceived: {
          type: "market",
          marketId: limit.marketId,
          asset: "collateral",
        },
        sharesMinted: {
          type: "position",
          marketId: limit.marketId,
          shares: "borrowShares",
        },
        sharesBurned: {
          type: "position",
          marketId: limit.marketId,
          shares: "borrowShares",
        },
      };
    case "blueRefinance":
      return {
        subject: {
          operation: limit.type,
          sourceMarketId: limit.sourceMarketId,
          targetMarketId: limit.targetMarketId,
        },
        assetsPaid: {
          type: "market",
          marketId: limit.sourceMarketId,
          asset: "loan",
        },
        assetsReceived: {
          type: "market",
          marketId: limit.sourceMarketId,
          asset: "loan",
        },
        sharesMinted: {
          type: "position",
          marketId: limit.targetMarketId,
          shares: "borrowShares",
        },
        sharesBurned: {
          type: "position",
          marketId: limit.sourceMarketId,
          shares: "borrowShares",
        },
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
          ...(limit.adapter !== undefined ? { adapter: limit.adapter } : {}),
        },
        assetsPaid: { type: "vault", vault: limit.vault },
        assetsReceived: { type: "vault", vault: limit.vault },
        sharesMinted: { type: "balance", token: limit.vault },
        sharesBurned: { type: "balance", token: limit.vault },
      };
    case "vaultV1MigrateToV2":
      return {
        subject: {
          operation: limit.type,
          sourceVault: limit.sourceVault,
          targetVault: limit.targetVault,
        },
        assetsPaid: { type: "vault", vault: limit.sourceVault },
        assetsReceived: { type: "vault", vault: limit.sourceVault },
        sharesMinted: { type: "balance", token: limit.targetVault },
        sharesBurned: { type: "balance", token: limit.sourceVault },
      };
    default: {
      const exhaustive: never = limit;
      return exhaustive;
    }
  }
}
