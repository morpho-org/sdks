import type { MarketId } from "@morpho-org/blue-sdk";
import type { Address } from "viem";

/** Every decoded operation type; source of `OperationType`. */
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

/** Discriminator for decoded operations and their limits. */
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

/** Protocol entity the failing operation acts on, keyed by `operation`. */
export type SimulationOperationSubject =
  | {
      readonly operation: BlueMarketOperationType;
      /** Blue market the operation acts on. */
      readonly marketId: MarketId;
    }
  | {
      readonly operation: "blueRefinance";
      /** Market the refinance closes. */
      readonly sourceMarketId: MarketId;
      /** Market the refinance opens. */
      readonly targetMarketId: MarketId;
    }
  | {
      readonly operation: "blueAuthorization";
      /** Operator whose Morpho authorization the operation sets. */
      readonly authorized: Address;
    }
  | {
      readonly operation: VaultOperationType;
      /** Vault the operation acts on. */
      readonly vault: Address;
      /** Vault V2 adapter the operation routes through. */
      readonly adapter?: Address;
    }
  | {
      readonly operation: "vaultV1MigrateToV2";
      /** Vault the migration exits. */
      readonly sourceVault: Address;
      /** Vault the migration enters. */
      readonly targetVault: Address;
    };

/** @internal Limit for a Blue `supply` operation. */
export interface BlueSupplyLimit {
  readonly type: "blueSupply";
  readonly marketId: MarketId;
  readonly transactionIndex?: number;
  readonly expectedAssets?: bigint;
  readonly expectedOnBehalf?: Address;
  readonly minSupplySharesMinted?: bigint;
}

/** @internal Limit for a Blue `withdraw` operation. */
export interface BlueWithdrawLimit {
  readonly type: "blueWithdraw";
  readonly marketId: MarketId;
  readonly transactionIndex?: number;
  readonly expectedReceiver?: Address;
  readonly expectedFullClose?: boolean;
  readonly minAssetsReceived?: bigint;
  readonly maxSupplySharesBurned?: bigint;
  readonly maxUtilizationAfterWad?: bigint;
  readonly maxReallocationPenaltyAssets?: bigint;
}

/** @internal Limit for a Blue `supplyCollateral` operation. */
export interface BlueSupplyCollateralLimit {
  readonly type: "blueSupplyCollateral";
  readonly marketId: MarketId;
  readonly transactionIndex?: number;
  readonly expectedAssets?: bigint;
  readonly expectedOnBehalf?: Address;
  readonly maxLtvAfterWad?: bigint;
}

/** @internal Limit for a Blue `borrow` operation. */
export interface BlueBorrowLimit {
  readonly type: "blueBorrow";
  readonly marketId: MarketId;
  readonly transactionIndex?: number;
  readonly expectedAssets?: bigint;
  readonly expectedReceiver?: Address;
  readonly maxBorrowSharesMinted?: bigint;
  readonly maxLtvAfterWad?: bigint;
  readonly minHealthFactorAfterWad?: bigint;
  readonly maxUtilizationAfterWad?: bigint;
  readonly maxAfterBorrowApyWad?: bigint;
  readonly maxReallocationPenaltyAssets?: bigint;
}

/** @internal Limit for a combined Blue `supplyCollateral` + `borrow` operation. */
export interface BlueSupplyCollateralBorrowLimit {
  readonly type: "blueSupplyCollateralBorrow";
  readonly marketId: MarketId;
  readonly transactionIndex?: number;
  readonly expectedCollateralAssets?: bigint;
  readonly expectedBorrowAssets?: bigint;
  readonly expectedOnBehalf?: Address;
  readonly expectedReceiver?: Address;
  readonly maxBorrowSharesMinted?: bigint;
  readonly maxLtvAfterWad?: bigint;
  readonly minHealthFactorAfterWad?: bigint;
  readonly maxUtilizationAfterWad?: bigint;
  readonly maxAfterBorrowApyWad?: bigint;
  readonly maxReallocationPenaltyAssets?: bigint;
}

/** @internal Limit for a Blue `repay` operation. */
export interface BlueRepayLimit {
  readonly type: "blueRepay";
  readonly marketId: MarketId;
  readonly transactionIndex?: number;
  readonly expectedOnBehalf?: Address;
  readonly expectedFullClose?: boolean;
  readonly maxAssetsPaid?: bigint;
  readonly minBorrowSharesBurned?: bigint;
  readonly maxResidualBorrowShares?: bigint;
  readonly minRefundAssets?: bigint;
}

/** @internal Limit for a Blue `withdrawCollateral` operation. */
export interface BlueWithdrawCollateralLimit {
  readonly type: "blueWithdrawCollateral";
  readonly marketId: MarketId;
  readonly transactionIndex?: number;
  readonly expectedAssets?: bigint;
  readonly expectedReceiver?: Address;
  readonly maxLtvAfterWad?: bigint;
  readonly minHealthFactorAfterWad?: bigint;
}

/** @internal Limit for a combined Blue `repay` + `withdrawCollateral` operation. */
export interface BlueRepayWithdrawCollateralLimit {
  readonly type: "blueRepayWithdrawCollateral";
  readonly marketId: MarketId;
  readonly transactionIndex?: number;
  readonly expectedWithdrawAssets?: bigint;
  readonly expectedOnBehalf?: Address;
  readonly expectedReceiver?: Address;
  readonly expectedFullClose?: boolean;
  readonly maxAssetsPaid?: bigint;
  readonly minBorrowSharesBurned?: bigint;
  readonly maxResidualBorrowShares?: bigint;
  readonly minRefundAssets?: bigint;
  readonly maxLtvAfterWad?: bigint;
  readonly minHealthFactorAfterWad?: bigint;
}

/** @internal Limit for a full refinance between two Blue markets. The source position is always fully closed; there is no pin for it. */
export interface BlueRefinanceLimit {
  readonly type: "blueRefinance";
  readonly sourceMarketId: MarketId;
  readonly targetMarketId: MarketId;
  readonly transactionIndex?: number;
  readonly maxTargetBorrowAssets?: bigint;
  readonly maxTargetBorrowSharesMinted?: bigint;
  readonly maxSourceResidualBorrowShares?: bigint;
  readonly maxTargetLtvAfterWad?: bigint;
  readonly minTargetHealthFactorAfterWad?: bigint;
  readonly maxLoanDustAssets?: bigint;
  readonly maxReallocationPenaltyAssets?: bigint;
}

/** @internal Limit for a Morpho `setAuthorization` operation. */
export interface BlueAuthorizationLimit {
  readonly type: "blueAuthorization";
  readonly authorized: Address;
  readonly transactionIndex?: number;
  readonly expectedIsAuthorized?: boolean;
}

/** @internal Limit for a vault `deposit` operation. */
export interface VaultDepositLimit {
  readonly type: "vaultV1Deposit" | "vaultV2Deposit";
  readonly vault: Address;
  readonly transactionIndex?: number;
  readonly expectedAssets?: bigint;
  readonly expectedReceiver?: Address;
  readonly minSharesMinted?: bigint;
}

/** @internal Limit for a vault `withdraw` operation. */
export interface VaultWithdrawLimit {
  readonly type: "vaultV1Withdraw" | "vaultV2Withdraw";
  readonly vault: Address;
  readonly transactionIndex?: number;
  readonly expectedAssets?: bigint;
  readonly expectedReceiver?: Address;
  readonly maxSharesBurned?: bigint;
}

/** @internal Limit for a vault `redeem` operation. */
export interface VaultRedeemLimit {
  readonly type: "vaultV1Redeem" | "vaultV2Redeem";
  readonly vault: Address;
  readonly transactionIndex?: number;
  readonly expectedShares?: bigint;
  readonly expectedReceiver?: Address;
  readonly minAssetsReceived?: bigint;
}

/** @internal Limit for a Vault V2 `forceWithdraw` operation. */
export interface VaultV2ForceWithdrawLimit {
  readonly type: "vaultV2ForceWithdraw";
  readonly vault: Address;
  readonly transactionIndex?: number;
  /** Penalty-inclusive. */
  readonly expectedExitAssets?: bigint;
  readonly expectedAdapter?: Address;
  readonly maxSharesBurned?: bigint;
  readonly minAssetsReceived?: bigint;
  readonly maxPenaltyAssets?: bigint;
}

/** @internal One expected deallocation step of a forced exit or in-kind redeem. */
export interface VaultDeallocation {
  readonly adapter: Address;
  readonly marketId?: MarketId;
  readonly assets: bigint;
}

/** @internal Limit for a Vault V2 `forceRedeem` operation. */
export interface VaultV2ForceRedeemLimit {
  readonly type: "vaultV2ForceRedeem";
  readonly vault: Address;
  readonly transactionIndex?: number;
  readonly expectedShares?: bigint;
  readonly expectedRecipient?: Address;
  readonly expectedOnBehalf?: Address;
  /** Ordered. */
  readonly expectedDeallocations?: readonly VaultDeallocation[];
  readonly minAssetsReceived?: bigint;
  readonly maxPenaltyShares?: bigint;
  readonly maxPenaltyAssets?: bigint;
}

/** @internal Minimum supply assets expected in one market after an in-kind redeem. */
export interface MarketMinAssets {
  readonly marketId: MarketId;
  readonly minAssets: bigint;
}

/** @internal Limit for a vault in-kind redeem operation. */
export interface VaultInKindRedeemLimit {
  readonly type: "vaultV1InKindRedeem" | "vaultV2InKindRedeem";
  readonly vault: Address;
  readonly transactionIndex?: number;
  readonly expectedAssets?: bigint;
  /** Ordered. */
  readonly expectedMarketIds?: readonly MarketId[];
  readonly maxSharesBurned?: bigint;
  readonly minIdleAssetsReceived?: bigint;
  readonly minSupplyAssetsByMarket?: readonly MarketMinAssets[];
  readonly maxPenaltyAssets?: bigint;
  readonly maxResidualShareAllowance?: bigint;
}

/** @internal Limit for a Vault V1 → V2 migration. Pin either `expectedAssets` or `expectedShares`, not both (checked at runtime). */
export interface VaultV1MigrateToV2Limit {
  readonly type: "vaultV1MigrateToV2";
  readonly sourceVault: Address;
  readonly targetVault: Address;
  readonly transactionIndex?: number;
  readonly expectedAssets?: bigint;
  readonly expectedShares?: bigint;
  readonly expectedReceiver?: Address;
  readonly minTargetSharesMinted?: bigint;
}

/** @internal Union of all per-operation limits. */
export type OperationLimit =
  | BlueSupplyLimit
  | BlueWithdrawLimit
  | BlueSupplyCollateralLimit
  | BlueBorrowLimit
  | BlueSupplyCollateralBorrowLimit
  | BlueRepayLimit
  | BlueWithdrawCollateralLimit
  | BlueRepayWithdrawCollateralLimit
  | BlueRefinanceLimit
  | BlueAuthorizationLimit
  | VaultDepositLimit
  | VaultWithdrawLimit
  | VaultRedeemLimit
  | VaultV2ForceWithdrawLimit
  | VaultV2ForceRedeemLimit
  | VaultInKindRedeemLimit
  | VaultV1MigrateToV2Limit;

/** @internal WAD ratios, raw amounts, inclusive bounds. Consumers may only tighten. */
export interface SimulationLimits {
  /** Default 0.03% (`3_00000000000000n`). */
  readonly maxSlippageWad?: bigint;
  /** Default 0.5% (`WAD / 200n`). */
  readonly minLltvBufferWad?: bigint;
  /** Default `7_200n`. */
  readonly maxSignatureLifetimeSeconds?: bigint;
  readonly operations?: readonly OperationLimit[];
}
