import type { MarketId } from "@morpho-org/blue-sdk";
import type { Address } from "viem";

/** Raw token amount; native currency uses viem's ethAddress. @internal */
export interface TokenAmount {
  readonly token: Address;
  readonly amount: bigint;
}

/** Ordered adapter deallocation pin; marketId identifies a Blue-market adapter leg. @internal */
export interface SimulationDeallocation {
  readonly adapter: Address;
  readonly marketId?: MarketId;
  readonly amount: bigint;
}

/** Minimum verified supply credit for one selected in-kind market, in loan assets. @internal */
export interface MarketSupplyMinimum {
  readonly marketId: MarketId;
  readonly minAssets: bigint;
}

/** Per-operation fields from the TIB; fixed names encode units and binding subjects. @internal */
export interface OperationLimitFields {
  readonly blueSupply: {
    readonly marketId: MarketId;
    readonly expectedAssets?: bigint;
    readonly expectedOnBehalf?: Address;
    readonly minSupplySharesMinted?: bigint;
  };
  readonly blueWithdraw: {
    readonly marketId: MarketId;
    readonly expectedReceiver?: Address;
    readonly expectedFullClose?: boolean;
    readonly minAssetsReceived?: bigint;
    readonly maxSupplySharesBurned?: bigint;
    readonly maxUtilizationAfterWad?: bigint;
    readonly maxReallocationPenaltyAssets?: bigint;
  };
  readonly blueSupplyCollateral: {
    readonly marketId: MarketId;
    readonly expectedAssets?: bigint;
    readonly expectedOnBehalf?: Address;
    readonly maxLtvAfterWad?: bigint;
  };
  readonly blueBorrow: {
    readonly marketId: MarketId;
    readonly expectedAssets?: bigint;
    readonly expectedReceiver?: Address;
    readonly maxBorrowSharesMinted?: bigint;
    readonly maxLtvAfterWad?: bigint;
    readonly minHealthFactorAfterWad?: bigint;
    readonly maxUtilizationAfterWad?: bigint;
    readonly maxBorrowApyAfterWad?: bigint;
    readonly maxReallocationPenaltyAssets?: bigint;
  };
  readonly blueSupplyCollateralBorrow: {
    readonly marketId: MarketId;
    readonly expectedCollateralAssets?: bigint;
    readonly expectedBorrowAssets?: bigint;
    readonly expectedOnBehalf?: Address;
    readonly expectedReceiver?: Address;
    readonly maxBorrowSharesMinted?: bigint;
    readonly maxLtvAfterWad?: bigint;
    readonly minHealthFactorAfterWad?: bigint;
    readonly maxUtilizationAfterWad?: bigint;
    readonly maxBorrowApyAfterWad?: bigint;
    readonly maxReallocationPenaltyAssets?: bigint;
  };
  readonly blueRepay: {
    readonly marketId: MarketId;
    readonly expectedOnBehalf?: Address;
    readonly expectedFullClose?: boolean;
    readonly maxAssetsPaid?: bigint;
    readonly minBorrowSharesBurned?: bigint;
    readonly maxResidualBorrowShares?: bigint;
    readonly minRefundAssets?: bigint;
  };
  readonly blueWithdrawCollateral: {
    readonly marketId: MarketId;
    readonly expectedAssets?: bigint;
    readonly expectedReceiver?: Address;
    readonly maxLtvAfterWad?: bigint;
    readonly minHealthFactorAfterWad?: bigint;
  };
  readonly blueRepayWithdrawCollateral: {
    readonly marketId: MarketId;
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
  };
  readonly blueRefinance: {
    readonly sourceMarketId: MarketId;
    readonly targetMarketId: MarketId;
    readonly expectedSourceFullClose?: boolean;
    readonly maxTargetBorrowAssets?: bigint;
    readonly maxTargetBorrowSharesMinted?: bigint;
    readonly maxSourceResidualBorrowShares?: bigint;
    readonly maxTargetLtvAfterWad?: bigint;
    readonly minTargetHealthFactorAfterWad?: bigint;
    readonly maxLoanDustAssets?: bigint;
    readonly maxReallocationPenaltyAssets?: bigint;
  };
  readonly blueAuthorization: {
    readonly authorized: Address;
    readonly expectedIsAuthorized?: boolean;
  };
  readonly vaultV1Deposit: {
    readonly vault: Address;
    readonly expectedAssets?: bigint;
    readonly expectedReceiver?: Address;
    readonly minSharesMinted?: bigint;
  };
  readonly vaultV2Deposit: OperationLimitFields["vaultV1Deposit"];
  readonly vaultV1Withdraw: {
    readonly vault: Address;
    readonly expectedAssets?: bigint;
    readonly expectedReceiver?: Address;
    readonly maxSharesBurned?: bigint;
  };
  readonly vaultV2Withdraw: OperationLimitFields["vaultV1Withdraw"];
  readonly vaultV1Redeem: {
    readonly vault: Address;
    readonly expectedShares?: bigint;
    readonly expectedReceiver?: Address;
    readonly minAssetsReceived?: bigint;
  };
  readonly vaultV2Redeem: OperationLimitFields["vaultV1Redeem"];
  readonly vaultV2ForceWithdraw: {
    readonly vault: Address;
    readonly expectedExitAssets?: bigint;
    readonly expectedAdapter?: Address;
    readonly maxSharesBurned?: bigint;
    readonly minAssetsReceived?: bigint;
    readonly maxPenaltyAssets?: bigint;
  };
  readonly vaultV2ForceRedeem: {
    readonly vault: Address;
    readonly expectedShares?: bigint;
    readonly expectedDeallocations?: readonly SimulationDeallocation[];
    readonly minAssetsReceived?: bigint;
    readonly maxPenaltyShares?: bigint;
    readonly maxPenaltyAssets?: bigint;
  };
  readonly vaultV1InKindRedeem: {
    readonly vault: Address;
    readonly expectedAssets?: bigint;
    readonly expectedMarketIds?: readonly MarketId[];
    readonly maxSharesBurned?: bigint;
    readonly minIdleAssetsReceived?: bigint;
    readonly minSupplyAssetsByMarket?: readonly MarketSupplyMinimum[];
    readonly maxPenaltyAssets?: bigint;
    readonly maxResidualShareAllowance?: bigint;
  };
  readonly vaultV2InKindRedeem: OperationLimitFields["vaultV1InKindRedeem"];
  readonly vaultV1MigrateToV2: {
    readonly sourceVault: Address;
    readonly targetVault: Address;
    readonly expectedReceiver?: Address;
    readonly minTargetSharesMinted?: bigint;
  } & (
    | { readonly expectedAssets?: bigint; readonly expectedShares?: never }
    | { readonly expectedAssets?: never; readonly expectedShares?: bigint }
  );
}

/** Inclusive constraints bound to exactly one operation; consumers may only tighten. @internal */
export type OperationLimit = {
  [Type in keyof OperationLimitFields]: {
    readonly type: Type;
    /** Original index in the caller's transactions, used to disambiguate repeated subjects. */
    readonly transactionIndex?: number;
  } & OperationLimitFields[Type];
}[keyof OperationLimitFields];

/** Optional consumer constraints; amounts use raw units and ratios/APYs use WAD. @internal */
export interface SimulationLimits {
  /** Defaults to DEFAULT_SLIPPAGE_TOLERANCE (0.03%); may only decrease. */
  readonly maxSlippageWad?: bigint;
  /** Defaults to DEFAULT_LLTV_BUFFER (0.5%); may only increase. */
  readonly minLltvBufferWad?: bigint;
  /** Defaults to 7200 seconds from the pinned execution timestamp; may only decrease. */
  readonly maxSignatureLifetimeSeconds?: bigint;
  /** Net wallet changes exclude gas. */
  readonly wallet?: {
    readonly maxDebit?: readonly TokenAmount[];
    readonly minCredit?: readonly TokenAmount[];
  };
  readonly operations?: readonly OperationLimit[];
}

/** Fully resolved defaults and supplied constraints, without claiming they passed. @internal */
export interface EffectiveSimulationLimits {
  readonly maxSlippageWad: bigint;
  readonly minLltvBufferWad: bigint;
  readonly maxSignatureLifetimeSeconds: bigint;
  readonly wallet: {
    readonly maxDebit: readonly TokenAmount[];
    readonly minCredit: readonly TokenAmount[];
  };
  readonly operations: readonly OperationLimit[];
}
