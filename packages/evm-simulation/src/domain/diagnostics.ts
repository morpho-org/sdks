import type { MarketId } from "@morpho-org/blue-sdk";
import type { Address, Hex } from "viem";
import type { RiskMetric } from "./evidence.js";
import type { OperationLimitFields, SimulationDeallocation } from "./limits.js";
import type { DecodedOperation, OperationIdentity } from "./operations.js";

/** Existing and planned class/code identities; this PR implements no new errors. @internal */
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

/** Complete literal union of every catalog code; a `switch` over it is exhaustive. @internal */
export type SimulationErrorCode =
  SimulationErrorCodes[keyof SimulationErrorCodes];

/** Machine-readable execution failure cause; consumers never parse `reason`. @internal */
export type SimulationExecutionReason =
  | "INSUFFICIENT_BALANCE"
  | "INSUFFICIENT_ALLOWANCE"
  | "INSUFFICIENT_LIQUIDITY"
  | "POSITION_UNHEALTHY"
  | "SLIPPAGE_EXCEEDED"
  | "SIGNATURE_EXPIRED"
  | "SIGNATURE_INVALID"
  | "NONCE_ALREADY_USED"
  | "CAP_EXCEEDED"
  | "ACCESS_RESTRICTED"
  | "UNKNOWN_REVERT";

/** Stage keying the error context; transport covers RPC and response failures. @internal */
export type SimulationStage =
  | "validation"
  | "preparation"
  | "execution"
  | "verification"
  | "transport";

/** Typed affected subject, including compound refinance and migration bindings. @internal */
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

/** Safe, fixed-unit expected/observed comparison, never raw causes or signature payloads. @internal */
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

/** Explicit failure indices; `failedTransactionIndex` always indexes the caller's transactions. @internal */
export type SimulationErrorLocation =
  | {
      readonly type: "transaction";
      readonly failedTransactionIndex: number;
      readonly callPath: readonly number[];
    }
  | {
      readonly type: "authorization";
      readonly authorizationIndex: number;
      readonly preparationCallIndex?: number;
    }
  | { readonly type: "probe"; readonly probeId: string };

interface SimulationContextBase {
  readonly mode: "preview" | "final";
  /** Requested chain; known before any resolution. */
  readonly chainId: number;
  readonly location?: SimulationErrorLocation;
}

interface PinnedContext extends SimulationContextBase {
  readonly blockNumber: bigint;
  readonly blockHash?: Hex;
  readonly blockTimestamp?: bigint;
}

interface OperationContext extends PinnedContext {
  readonly operation: DecodedOperation["type"];
  readonly subject: SimulationSubject;
  readonly comparison?: SimulationComparison;
}

/**
 * Exact readonly context on every error, keyed by stage. Validation and transport failures may
 * precede block pinning, so only they omit `blockNumber`; no sentinel block is ever emitted.
 * Contains no signatures, RPC URLs, credentials, raw calldata or raw causes; `cause` stays on
 * the error for logging only.
 * @internal
 */
export type SimulationErrorContext =
  | {
      [Stage in "validation" | "transport"]: SimulationContextBase & {
        readonly stage: Stage;
        readonly blockNumber?: bigint;
        readonly operation?: DecodedOperation["type"];
        readonly subject?: SimulationSubject;
      };
    }["validation" | "transport"]
  | (PinnedContext & {
      readonly stage: "preparation";
      readonly location: Extract<
        SimulationErrorLocation,
        { type: "authorization" }
      >;
      readonly subject?: SimulationSubject;
    })
  | {
      [Stage in "execution" | "verification"]: OperationContext & {
        readonly stage: Stage;
      };
    }["execution" | "verification"];

/**
 * Class-specific fields beside the common context; `reasonCode` follows the ADR's
 * `SimulationRevertedError`, and a revert can only carry a preparation or execution context.
 */
interface SimulationErrorExtras {
  readonly SimulationRevertedError: {
    readonly reasonCode: SimulationExecutionReason;
    readonly context: Extract<
      SimulationErrorContext,
      { stage: "preparation" | "execution" }
    >;
  };
}

/**
 * Structural shape checked by `isSimulationPackageError` when `instanceof` fails across bundles.
 * Distributive: each `name` narrows `code` to its own literal and vice versa.
 * @internal
 */
export type SimulationErrorShape<
  Name extends keyof SimulationErrorCodes = keyof SimulationErrorCodes,
> = {
  [N in Name]: {
    readonly name: N;
    readonly code: SimulationErrorCodes[N];
    readonly context: SimulationErrorContext;
  } & (N extends keyof SimulationErrorExtras
    ? SimulationErrorExtras[N]
    : unknown);
}[Name];

type ConstraintField<T> = Extract<
  keyof T,
  `expected${string}` | `min${string}` | `max${string}`
>;

/** Consumer constraint context relates the operation tag to its applicable field. @internal */
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
