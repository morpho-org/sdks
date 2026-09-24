import type { MarketId } from "@morpho-org/blue-sdk";
import type { Address, Hex } from "viem";
import type { SimulationCall, SimulationTransaction } from "../types.js";
import type { SimulationAuthorization } from "./authorizations.js";
import type { MarketBinding, OperationIdentity } from "./operations.js";

/** Resolved state anchor and execution metadata, including node block advancement. @internal */
export interface ExecutionContext {
  readonly chainId: number;
  readonly stateBlockNumber: bigint;
  readonly stateBlockHash: Hex;
  readonly stateBlockTimestamp: bigint;
  readonly blockNumber: bigint;
  readonly blockTimestamp: bigint;
}

/** Meaningful WAD measurement; debt-free and infinite ratios are not numeric sentinels. @internal */
export type RiskMetric =
  | { readonly type: "finite"; readonly valueWad: bigint }
  | { readonly type: "debtFree" }
  | {
      readonly type: "unbounded";
      readonly reason: "zeroCollateral" | "zeroLiquidity";
    };

/** Defined absence is different from missing evidence and must name its reason. @internal */
export type Applicable<T> =
  | { readonly type: "applicable"; readonly value: T }
  | {
      readonly type: "notApplicable";
      readonly reason: "noOracle" | "noIrm" | "noPreLiquidation";
    };

/** Incomplete boundary evidence; this union is never accepted in a verified result. @internal */
export type EvidenceRead<T> =
  | { readonly type: "present"; readonly value: T }
  | {
      readonly type: "missing";
      readonly reason: "failedProbe" | "missingState" | "inconsistentReference";
    };

/** Token balance at a snapshot; native uses ethAddress and excludes gas effects. @internal */
export interface WalletBalance {
  readonly account: Address;
  readonly token: Address;
  readonly assets: bigint;
}

/** Permission or nonce subject; each state carries the fields specific to its mechanism. @internal */
export type PermissionState =
  | {
      readonly type: "erc20Allowance";
      readonly token: Address;
      readonly owner: Address;
      readonly spender: Address;
      readonly amount: bigint;
    }
  | {
      readonly type: "blueAuthorization";
      readonly morpho: Address;
      readonly authorizer: Address;
      readonly authorized: Address;
      readonly isAuthorized: boolean;
    }
  | {
      readonly type: "erc2612Nonce";
      readonly verifyingContract: Address;
      readonly owner: Address;
      readonly nonce: bigint;
    }
  | {
      readonly type: "blueAuthorizationNonce";
      readonly verifyingContract: Address;
      readonly owner: Address;
      readonly nonce: bigint;
    }
  | {
      readonly type: "permit2Nonce";
      readonly permit2: Address;
      readonly owner: Address;
      readonly nonce: bigint;
      readonly wordPosition: bigint;
      readonly bitmap: bigint;
      readonly consumed: boolean;
    };

/** Blue user position with raw amounts and explicit risk states. @internal */
export interface PositionState {
  readonly marketId: MarketId;
  readonly owner: Address;
  readonly supplyAssets: bigint;
  readonly supplyShares: bigint;
  readonly borrowAssets: bigint;
  readonly borrowShares: bigint;
  readonly collateralAssets: bigint;
  readonly ltvWad: RiskMetric;
  readonly healthFactorWad: RiskMetric;
}

/** Market totals, modeled risk inputs and active liquidation policy at one state. @internal */
export interface MarketState {
  readonly market: MarketBinding;
  readonly totalSupplyAssets: bigint;
  readonly totalSupplyShares: bigint;
  readonly totalBorrowAssets: bigint;
  readonly totalBorrowShares: bigint;
  readonly lastUpdate: bigint;
  readonly feeWad: bigint;
  readonly liquidityAssets: bigint;
  readonly utilizationWad: RiskMetric;
  readonly borrowApyWad: Applicable<bigint>;
  readonly oraclePrice: Applicable<{
    readonly value: bigint;
    readonly scale: bigint;
  }>;
  readonly borrowRatePerSecondWad: Applicable<bigint>;
  readonly preLiquidation: Applicable<{
    readonly address: Address;
    readonly preLltvWad: bigint;
  }>;
}

/** One allocation and its configured caps, including caps below current allocation. @internal */
export interface VaultAllocation {
  readonly adapter: Address;
  readonly marketId?: MarketId;
  readonly assets: bigint;
  readonly shares: bigint;
  readonly absoluteCapAssets: bigint;
  readonly relativeCapWad: bigint;
  readonly penaltyWad: bigint;
}

/** Vault backing, shares and fee/conversion configuration, distinguished by generation. @internal */
export type VaultState = {
  readonly vault: Address;
  readonly owner: Address;
  readonly asset: Address;
  readonly totalAssets: bigint;
  readonly totalShares: bigint;
  readonly ownerShares: bigint;
  readonly idleAssets: bigint;
  readonly sharePriceE27: bigint;
  readonly feeRecipient: Address;
  readonly performanceFeeWad: bigint;
  readonly allocations: readonly VaultAllocation[];
} & (
  | { readonly type: "vaultV1"; readonly lastTotalAssets: bigint }
  | {
      readonly type: "vaultV2";
      readonly managementFeeWad: bigint;
      readonly managementFeeRecipient: Address;
      readonly maxRatePerSecondWad: bigint;
      readonly lastUpdate: bigint;
      readonly recordedTotalAssets: bigint;
    }
);

/** Complete state; unchanged subjects are retained alongside changed subjects. @internal */
export interface VerificationSnapshot {
  readonly wallet: readonly WalletBalance[];
  readonly permissions: readonly PermissionState[];
  readonly positions: readonly PositionState[];
  readonly vaults: readonly VaultState[];
  readonly markets: readonly MarketState[];
}

/** Permission transition with the same mechanism before and after. @internal */
export type PermissionChange = {
  [Type in PermissionState["type"]]: {
    readonly before: Extract<PermissionState, { readonly type: Type }>;
    readonly after: Extract<PermissionState, { readonly type: Type }>;
  };
}[PermissionState["type"]];

/** WAD difference when finite at both ends; otherwise the states explain the transition. @internal */
export type RiskMetricChange =
  | { readonly type: "finite"; readonly diffWad: bigint }
  | {
      readonly type: "transition";
      readonly before: RiskMetric;
      readonly after: RiskMetric;
    };

/** Signed changes; actionDiff uses these shapes after modeled accrual is removed. @internal */
export interface VerificationDiff {
  readonly wallet: readonly WalletBalance[];
  readonly permissions: readonly PermissionChange[];
  readonly positions: readonly {
    readonly marketId: MarketId;
    readonly owner: Address;
    readonly supplyAssets: bigint;
    readonly supplyShares: bigint;
    readonly borrowAssets: bigint;
    readonly borrowShares: bigint;
    readonly collateralAssets: bigint;
    readonly ltvWad: RiskMetricChange;
    readonly healthFactorWad: RiskMetricChange;
  }[];
  readonly vaults: readonly {
    readonly vault: Address;
    readonly totalAssets: bigint;
    readonly totalShares: bigint;
    readonly ownerShares: bigint;
    readonly idleAssets: bigint;
    readonly allocations: readonly {
      readonly adapter: Address;
      readonly marketId?: MarketId;
      readonly assets: bigint;
      readonly shares: bigint;
    }[];
  }[];
  readonly markets: readonly {
    readonly marketId: MarketId;
    readonly totalSupplyAssets: bigint;
    readonly totalSupplyShares: bigint;
    readonly totalBorrowAssets: bigint;
    readonly totalBorrowShares: bigint;
    readonly liquidityAssets: bigint;
    readonly utilizationWad: RiskMetricChange;
    readonly borrowApyWad: Applicable<bigint>;
  }[];
}

/** Internal probe identity names a snapshot phase and sequence without impersonating a user call. @internal */
export interface ProbeIdentity {
  readonly type: "probe";
  readonly probeId: string;
  readonly phase: "before" | "prepared" | "intermediate" | "after";
}

/** Exclusive call identity; authorization and probe records have no public txIdx. @internal */
export type ExecutionIdentity =
  | { readonly type: "transaction"; readonly transactionIndex: number }
  | {
      readonly type: "authorization";
      readonly authorizationIndex: number;
      readonly preparationCallIndex: number;
    }
  | ProbeIdentity;

/** Ordered preparation and observed results, or the precise permission storage override. @internal */
export type AuthorizationPreparation =
  | {
      readonly type: "approvalCalls";
      readonly calls: readonly {
        readonly transaction: Required<Readonly<SimulationTransaction>>;
        readonly result: SimulationCall;
      }[];
    }
  | {
      readonly type: "stateOverride";
      readonly address: Address;
      readonly storageVariable: "allowance" | "isAuthorized";
      readonly slot: Hex;
      readonly value: Hex;
    };

/** Same-state permission read-back; the actual and requested states are both retained. @internal */
export interface AuthorizationReadBack {
  readonly probe: ProbeIdentity;
  readonly expected: PermissionState;
  readonly observed: PermissionState;
}

/** Successful checks applicable to every request, with signature-specific checks separated. @internal */
export type AuthorizationRequestChecks = {
  readonly owner: "passed";
  readonly binding: "passed";
  readonly authority: "passed";
} & (
  | { readonly type: "transaction" }
  | {
      readonly type: "signature";
      readonly domain: "passed";
      readonly nonce: "passed";
      readonly deadline: "passed";
    }
  | {
      readonly type: "permit2SignatureTransfer";
      readonly domain: "passed";
      readonly nonce: "passed";
      readonly deadline: "passed";
      /** Independent from the synthetic direct bundle allowance. */
      readonly canonicalPermit2Allowance: "passed";
    }
);

/** Successful request proof, indexed separately from user transactions. @internal */
export type AuthorizationEvidence = {
  [Type in SimulationAuthorization["type"]]: {
    readonly authorizationIndex: number;
    readonly request: Extract<SimulationAuthorization, { readonly type: Type }>;
    readonly preparation: AuthorizationPreparation;
    readonly requestChecks: Extract<
      AuthorizationRequestChecks,
      {
        readonly type: Type extends "erc20Approval" | "blueAuthorization"
          ? "transaction"
          : Type extends "permit2SignatureTransfer"
            ? "permit2SignatureTransfer"
            : "signature";
      }
    >;
    readonly readBack: readonly AuthorizationReadBack[];
  };
}[SimulationAuthorization["type"]];

/** Verified conversion with pinned quote, actual rate, rounding and intersected bounds. @internal */
export interface ConversionEvidence extends OperationIdentity {
  readonly subject:
    | { readonly type: "market"; readonly marketId: MarketId }
    | { readonly type: "vault"; readonly vault: Address };
  readonly assets: bigint;
  readonly shares: bigint;
  readonly quotedSharePriceE27: bigint;
  readonly actualSharePriceE27: bigint;
  readonly minSharePriceE27: bigint;
  readonly maxSharePriceE27: bigint;
  readonly rounding: "up" | "down";
}

/** Reconciled fee or penalty, with actual units and expected recipient/schedule. @internal */
export interface FeeEvidence extends OperationIdentity {
  readonly type:
    | "referral"
    | "performance"
    | "management"
    | "exitPenalty"
    | "reallocationPenalty";
  readonly token: Address;
  readonly recipient: Address;
  readonly rateWad: bigint;
  readonly expectedAmount: bigint;
  readonly observedAmount: bigint;
  readonly unit: "assets" | "shares";
}

/** Intermediate permissions/events preserve temporary grants and spent allowances. @internal */
export interface PermissionEvidence {
  readonly identity: ExecutionIdentity;
  readonly changes: readonly PermissionChange[];
  readonly logs: SimulationCall["logs"];
}
