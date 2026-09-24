import type { MarketId } from "@morpho-org/blue-sdk";
import type { SimulationResult, SimulationTransaction } from "../types.js";
import type {
  AuthorizationEvidence,
  ConversionEvidence,
  ExecutionContext,
  FeeEvidence,
  PermissionEvidence,
  RiskMetric,
  VerificationDiff,
  VerificationSnapshot,
} from "./evidence.js";
import type { EffectiveSimulationLimits } from "./limits.js";
import type { DecodedOperation } from "./operations.js";

/** Verified operation outcomes corresponding to the appendix's inclusive bounds. @internal */
export interface OperationOutcomeFields {
  readonly blueSupply: {
    readonly supplySharesMinted: bigint;
  };
  readonly blueWithdraw: {
    readonly assetsReceived: bigint;
    readonly supplySharesBurned: bigint;
    readonly utilizationAfterWad: RiskMetric;
    readonly reallocationPenaltyAssets: bigint;
  };
  readonly blueSupplyCollateral: {
    readonly ltvAfterWad: RiskMetric;
  };
  readonly blueBorrow: {
    readonly borrowSharesMinted: bigint;
    readonly ltvAfterWad: RiskMetric;
    readonly healthFactorAfterWad: RiskMetric;
    readonly utilizationAfterWad: RiskMetric;
    readonly borrowApyAfterWad: bigint;
    readonly reallocationPenaltyAssets: bigint;
  };
  readonly blueSupplyCollateralBorrow: {
    readonly borrowSharesMinted: bigint;
    readonly ltvAfterWad: RiskMetric;
    readonly healthFactorAfterWad: RiskMetric;
    readonly utilizationAfterWad: RiskMetric;
    readonly borrowApyAfterWad: bigint;
    readonly reallocationPenaltyAssets: bigint;
  };
  readonly blueRepay: {
    readonly assetsPaid: bigint;
    readonly borrowSharesBurned: bigint;
    readonly residualBorrowShares: bigint;
    readonly refundAssets: bigint;
  };
  readonly blueWithdrawCollateral: {
    readonly ltvAfterWad: RiskMetric;
    readonly healthFactorAfterWad: RiskMetric;
  };
  readonly blueRepayWithdrawCollateral: {
    readonly assetsPaid: bigint;
    readonly borrowSharesBurned: bigint;
    readonly residualBorrowShares: bigint;
    readonly refundAssets: bigint;
    readonly ltvAfterWad: RiskMetric;
    readonly healthFactorAfterWad: RiskMetric;
  };
  readonly blueRefinance: {
    readonly targetBorrowAssets: bigint;
    readonly targetBorrowSharesMinted: bigint;
    readonly sourceResidualBorrowShares: bigint;
    readonly targetLtvAfterWad: RiskMetric;
    readonly targetHealthFactorAfterWad: RiskMetric;
    readonly loanDustAssets: bigint;
    readonly reallocationPenaltyAssets: bigint;
  };
  readonly blueAuthorization: {
    readonly isAuthorized: boolean;
  };
  readonly vaultV1Deposit: {
    readonly sharesMinted: bigint;
  };
  readonly vaultV2Deposit: {
    readonly sharesMinted: bigint;
  };
  readonly vaultV1Withdraw: {
    readonly sharesBurned: bigint;
  };
  readonly vaultV2Withdraw: {
    readonly sharesBurned: bigint;
  };
  readonly vaultV1Redeem: {
    readonly assetsReceived: bigint;
  };
  readonly vaultV2Redeem: {
    readonly assetsReceived: bigint;
  };
  readonly vaultV2ForceWithdraw: {
    readonly sharesBurned: bigint;
    readonly assetsReceived: bigint;
    readonly penaltyAssets: bigint;
  };
  readonly vaultV2ForceRedeem: {
    readonly assetsReceived: bigint;
    readonly penaltyShares: bigint;
    readonly penaltyAssets: bigint;
  };
  readonly vaultV1InKindRedeem: {
    readonly sharesBurned: bigint;
    readonly idleAssetsReceived: bigint;
    readonly supplyAssetsByMarket: readonly {
      readonly marketId: MarketId;
      readonly assets: bigint;
    }[];
    readonly penaltyAssets: bigint;
    readonly residualShareAllowance: bigint;
  };
  readonly vaultV2InKindRedeem: {
    readonly sharesBurned: bigint;
    readonly idleAssetsReceived: bigint;
    readonly supplyAssetsByMarket: readonly {
      readonly marketId: MarketId;
      readonly assets: bigint;
    }[];
    readonly penaltyAssets: bigint;
    readonly residualShareAllowance: bigint;
  };
  readonly vaultV1MigrateToV2: {
    readonly targetSharesMinted: bigint;
  };
}

/** Operation and matching verified outcome; a borrow cannot carry a vault-exit outcome. @internal */
export type VerifiedOperation = {
  [Type in DecodedOperation["type"]]: {
    readonly operation: Extract<DecodedOperation, { readonly type: Type }>;
    readonly outcome: OperationOutcomeFields[Type];
  };
}[DecodedOperation["type"]];

interface VerificationBase extends ExecutionContext {
  readonly limits: EffectiveSimulationLimits;
  readonly operations: readonly VerifiedOperation[];
  readonly before: VerificationSnapshot;
  readonly after: VerificationSnapshot;
  /** Total difference, including preparation and modeled accrual. */
  readonly diff: VerificationDiff;
  /** User action effects, excluding preparation and modeled accrual. */
  readonly actionDiff: VerificationDiff;
  readonly conversions: readonly ConversionEvidence[];
  readonly fees: readonly FeeEvidence[];
  readonly permissionEvidence: readonly PermissionEvidence[];
}

/** Complete verification; final mode cannot report pending-authority preparation. @internal */
export type SimulationVerification = VerificationBase &
  (
    | {
        readonly mode: "preview";
        readonly authorizations: readonly AuthorizationEvidence[];
      }
    | { readonly mode: "final"; readonly authorizations: readonly [] }
  );

/**
 * Target successful result, preserving every legacy field with user-only indices.
 * This declaration is not a claim that the current simulator performs verification.
 * @internal
 */
export interface VerifiedSimulationResult extends SimulationResult {
  /** Exactly the caller's ordered transactions; no preparation or probes. */
  readonly simulationTxs: readonly Readonly<SimulationTransaction>[];
  /** calls and transfers.txIdx refer only to simulationTxs; preparation is separate. */
  readonly verification: SimulationVerification;
}
