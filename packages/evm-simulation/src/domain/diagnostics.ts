import type { MarketId } from "@morpho-org/blue-sdk";
import type { Address, Hex } from "viem";
import type { RiskMetric } from "./evidence.js";
import type { OperationLimitFields, SimulationDeallocation } from "./limits.js";
import type { DecodedOperation, OperationIdentity } from "./operations.js";

/** Canonical error class/code identities implemented by this package's public error classes. @internal */
export interface SimulationErrorCodes {
  readonly SimulationValidationError: "VALIDATION_ERROR";
  readonly UnsupportedChainError: "UNSUPPORTED_CHAIN";
  readonly ExternalServiceError: "EXTERNAL_SERVICE_ERROR";
  readonly SimulationRevertedError: "SIMULATION_REVERTED";
  readonly BlacklistViolationError: "BLACKLIST_ERROR";
  readonly UnsupportedOperationError: "UNSUPPORTED_OPERATION";
  readonly ProtocolBindingMismatchError: "PROTOCOL_BINDING_MISMATCH";
  readonly UnsupportedVerificationFeatureError: "UNSUPPORTED_VERIFICATION_FEATURE";
  readonly InvalidSimulationResponseError: "INVALID_SIMULATION_RESPONSE";
  readonly MissingVerificationEvidenceError: "MISSING_VERIFICATION_EVIDENCE";
  readonly AuthorizationRequestMismatchError: "AUTHORIZATION_REQUEST_MISMATCH";
  readonly AssetChangeMismatchError: "ASSET_CHANGE_MISMATCH";
  readonly PermissionChangeMismatchError: "PERMISSION_CHANGE_MISMATCH";
  readonly StateChangeMismatchError: "STATE_CHANGE_MISMATCH";
  readonly MarketConstraintViolationError: "MARKET_CONSTRAINT_VIOLATION";
  readonly SlippageLimitExceededError: "SLIPPAGE_LIMIT_EXCEEDED";
  readonly FeeMismatchError: "FEE_MISMATCH";
  readonly ConsumerLimitViolationError: "CONSUMER_LIMIT_VIOLATION";
  readonly UnexpectedSimulationError: "UNEXPECTED_SIMULATION_ERROR";
}

/** Named stage at which failure occurred; not a transport/provider classification. */
export type SimulationStage =
  | "validation"
  | "decoding"
  | "pinnedReads"
  | "authorization"
  | "preparation"
  | "execution"
  | "evidence"
  | "verification"
  | "limits";

/** Typed affected subject, including compound refinance and migration bindings. */
export type SimulationSubject =
  | {
      readonly type: "wallet";
      readonly account: Address;
      readonly token: Address;
    }
  | {
      readonly type: "permission";
      readonly owner: Address;
      readonly token: Address;
      readonly spender: Address;
    }
  | {
      readonly type: "operator";
      readonly authorizer: Address;
      readonly authorized: Address;
    }
  | { readonly type: "market"; readonly marketId: MarketId }
  | {
      readonly type: "refinance";
      readonly sourceMarketId: MarketId;
      readonly targetMarketId: MarketId;
    }
  | { readonly type: "vault"; readonly vault: Address }
  | {
      readonly type: "migration";
      readonly sourceVault: Address;
      readonly targetVault: Address;
    }
  | {
      readonly type: "adapter";
      readonly vault: Address;
      readonly adapter: Address;
    }
  | { readonly type: "deployment"; readonly address: Address };

/** Safe, fixed-unit expected/observed comparison, never raw causes or signature payloads. */
export type SimulationComparison =
  | {
      readonly unit:
        | "assets"
        | "shares"
        | "apyWad"
        | "seconds"
        | "nonce"
        | "e27";
      readonly expected: bigint;
      readonly observed: bigint;
    }
  | {
      readonly unit: "wad";
      readonly expected: bigint;
      readonly observed: bigint | RiskMetric;
    }
  | {
      readonly unit: "marketIds";
      readonly expected: readonly MarketId[];
      readonly observed: readonly MarketId[];
    }
  | {
      readonly unit: "deallocations";
      readonly expected: readonly SimulationDeallocation[];
      readonly observed: readonly SimulationDeallocation[];
    }
  | {
      readonly unit: "address";
      readonly expected: Address;
      readonly observed: Address;
    }
  | {
      readonly unit: "boolean";
      readonly expected: boolean;
      readonly observed: boolean;
    }
  | {
      readonly unit: "marketId";
      readonly expected: MarketId;
      readonly observed: MarketId;
    }
  | {
      readonly unit: "count";
      readonly expected: number;
      readonly observed: number;
    };

/** Diagnostic location; preparation and probes cannot carry the legacy user txIdx. */
export type SimulationErrorLocation =
  | {
      readonly type: "transaction";
      readonly txIdx: number;
      readonly callPath: readonly number[];
    }
  | {
      readonly type: "authorization";
      readonly authorizationIndex: number;
      readonly preparationCallIndex?: number;
    }
  | { readonly type: "probe"; readonly probeId: string };

/** Readonly context added beside preserved legacy error fields and constructors. */
export interface SimulationErrorContext {
  readonly mode?: "preview" | "final";
  readonly stage: SimulationStage;
  readonly chainId?: number;
  readonly blockNumber?: bigint;
  readonly blockHash?: Hex;
  readonly blockTimestamp?: bigint;
  readonly operation?: DecodedOperation["type"];
  readonly location?: SimulationErrorLocation;
  readonly subject?: SimulationSubject;
  readonly comparison?: SimulationComparison;
}

type ConstraintField<T> = Extract<
  keyof T,
  `expected${string}` | `min${string}` | `max${string}`
>;

/** Consumer constraint context relates the operation tag to its applicable field. */
export type ConsumerConstraintContext =
  | {
      [Type in keyof OperationLimitFields]: OperationIdentity & {
        readonly type: Type;
        readonly field: ConstraintField<OperationLimitFields[Type]>;
        readonly subject: SimulationSubject;
        readonly comparison: SimulationComparison;
      };
    }[keyof OperationLimitFields]
  | {
      readonly type: "wallet";
      readonly field: "maxDebit" | "minCredit";
      readonly account: Address;
      readonly token: Address;
      readonly boundAssets: bigint;
      readonly observedAssets: bigint;
    };
