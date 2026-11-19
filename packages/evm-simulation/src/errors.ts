import type { MarketId } from "@morpho-org/blue-sdk";
import type { Address, Hex } from "viem";
import type { SimulationAuthorization } from "./authorizations.js";
import type { OperationType, SlippageQuote } from "./limits.js";
import type { Assertion, LogAssertion, RawLog } from "./types.js";

/** Stable error codes thrown by this package, part of the public API. */
export const SIMULATION_ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNSUPPORTED_CHAIN",
  "RPC_TRANSPORT_ERROR",
  "SIMULATION_REVERTED",
  "SIMULATION_ASSERT_FAILED",
  "BLACKLIST_ERROR",
  "UNSUPPORTED_OPERATION",
  "INVALID_SIMULATION_RESPONSE",
  "SLIPPAGE_CHECK_UNAVAILABLE",
  "AUTHORIZATION_REQUEST_MISMATCH",
  "CONSUMER_LIMIT_VIOLATION",
  "UNEXPECTED_SIMULATION_ERROR",
  "LIMIT_ACCOUNT_MISMATCH",
  "MISSING_EXPECTED_QUOTE",
  "AMBIGUOUS_EXPECTED_QUOTE",
  "UNSUPPORTED_LIMIT_ACTION",
  "UNEXPECTED_TOKEN_APPROVAL",
  "UNEXPECTED_MORPHO_AUTHORIZATION",
  "UNEXPECTED_MIDNIGHT_AUTHORIZATION",
  "APPROVAL_CHECK_UNAVAILABLE",
  "UNUSED_AUTHORIZATION",
] as const;

/** Stable string discriminator for log aggregation and external mapping. */
export type SimulationErrorCode = (typeof SIMULATION_ERROR_CODES)[number];

/**
 * Default log level of an SDK error, named like pino's levels so it indexes a logger with no mapping.
 * Every severity blocks the bundle: `simulate` returns no result for `warn` as for `fatal`. It is
 * for logging and alerting only; a failed report's `severity` is the highest of its failures'.
 */
export type SimulationErrorSeverity = "fatal" | "error" | "warn";

/**
 * Base class for SDK failures, including wrapped RPC errors. Transport-agnostic — no HTTP status codes.
 * Consumers pattern-match with `instanceof` on the concrete subclass.
 */
export abstract class SimulationPackageError extends Error {
  /** Stable string discriminator for log aggregation and external mapping. */
  abstract readonly code: SimulationErrorCode;

  /**
   * Log level. Defaults to `"error"`; each of the four groups sets its own, and one class
   * (`UnusedAuthorizationError`) overrides its group's. A direct subclass outside the groups inherits
   * `"error"`.
   * Every failure blocks the bundle whatever its severity; it is for logging and alerting only and is
   * absent from the JSON error response. A failed report's `severity` is the highest of its failures'.
   */
  readonly severity: SimulationErrorSeverity = "error";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/**
 * Base class for failures where funds or permissions are at risk.
 * Every group blocks the bundle; groups say who acts, not how bad it is. Default severity: `"fatal"`.
 */
export abstract class SimulationSafetyError extends SimulationPackageError {
  /** Default log level of this group; every severity blocks the bundle. */
  readonly severity: SimulationErrorSeverity = "fatal";
}

/**
 * Base class for failures where the user or caller acts.
 * Every group blocks the bundle; groups say who acts, not how bad it is. Default severity: `"warn"`.
 */
export abstract class SimulationExecutionError extends SimulationPackageError {
  /** Default log level of this group; every severity blocks the bundle. */
  readonly severity: SimulationErrorSeverity = "warn";
}

/**
 * Base class for failures where the integrator fixes the request or configuration.
 * Every group blocks the bundle; groups say who acts, not how bad it is. Default severity: `"error"`.
 */
export abstract class SimulationInvalidRequestError extends SimulationPackageError {
  /** Default log level of this group; every severity blocks the bundle. */
  readonly severity: SimulationErrorSeverity = "error";
}

/**
 * Base class for failures where the operator investigates the RPC/node or a check that could not run.
 * Every group blocks the bundle; groups say who acts, not how bad it is. Default severity: `"error"`.
 */
export abstract class SimulationInfrastructureError extends SimulationPackageError {
  /** Default log level of this group; every severity blocks the bundle. */
  readonly severity: SimulationErrorSeverity = "error";
}

/** A final-mode signed request has no matching use event in the user transactions. Extends {@link SimulationExecutionError}. */
export class UnusedAuthorizationError extends SimulationExecutionError {
  override readonly name = "UnusedAuthorizationError";
  readonly code = "UNUSED_AUTHORIZATION";
  /** `"error"`, not the group's `"warn"`: the signed request stays valid and the integrator assembled the bundle wrong. */
  override readonly severity: SimulationErrorSeverity = "error";

  /**
   * Identify the signed request whose event evidence is missing.
   * @param authorizationIndex - Zero-based index in the caller's authorizations.
   * @param authorization - Signed request that was not used.
   */
  constructor(
    public readonly authorizationIndex: number,
    public readonly authorization: Extract<
      SimulationAuthorization,
      {
        type:
          | "erc2612Permit"
          | "blueAuthorizationSignature"
          | "midnightAuthorizationSignature";
      }
    >,
  ) {
    super(
      `Authorization "${authorizationIndex}" (${authorization.type}) has no matching ${authorization.type === "erc2612Permit" ? "Approval" : authorization.type === "blueAuthorizationSignature" ? "IncrementNonce" : "SetIsAuthorized"} event in the bundle. Include and execute the signed request in the final transactions.`,
    );
  }
}

/**
 * A preparation call, transaction, or bundle reverted. Never bypassable.
 * Read `message` for the decoded error and every argument; use `revertData`
 * with a contract ABI for programmatic inspection. Messages are not stable codes.
 *
 * Extends {@link SimulationExecutionError}.
 * @example
 * ```ts
 * import { SimulationRevertedError } from "@morpho-org/evm-simulation";
 *
 * const error = new SimulationRevertedError("Transaction 0 reverted", "0xdeadbeef");
 * console.log(error.code); // "SIMULATION_REVERTED"
 * console.log(error.message, error.revertData);
 * ```
 */
export class SimulationRevertedError extends SimulationExecutionError {
  override readonly name = "SimulationRevertedError";
  readonly code = "SIMULATION_REVERTED";

  /** Zero-based index in the caller's transactions; absent for preparation or node-level reverts. */
  readonly transactionIndex?: number;

  /**
   * Preserve the readable explanation, original revert bytes and optional cause.
   * @param message - Human-readable failure, including decoded arguments when available.
   * @param revertData - Exact node-returned revert bytes; absent when unavailable.
   * @param options - Original cause and optional zero-based user transaction index.
   */
  // biome-ignore lint/complexity/useMaxParams: approved public error constructor signature
  constructor(
    message: string,
    public readonly revertData?: Hex,
    options?: ErrorOptions & { readonly transactionIndex?: number },
  ) {
    super(message, options);
    this.transactionIndex = options?.transactionIndex;
  }
}

/**
 * A caller-supplied `assertBefore`/`assertAfter` check did not hold on simulated
 * state or its read reverted. The error includes a copy of the caller's
 * assertion (`to`, `data`, and `check`) and the read's raw return or revert data.
 *
 * Extends {@link SimulationExecutionError}.
 * @example
 * ```ts
 * import {
 *   nativeBalanceAssertion,
 *   SimulationAssertError,
 * } from "@morpho-org/evm-simulation";
 * import { zeroAddress } from "viem";
 *
 * const error = new SimulationAssertError("Native balance is below the minimum", {
 *   transactionIndex: 0,
 *   phase: "before",
 *   assertionIndex: 0,
 *   assertion: nativeBalanceAssertion({ account: zeroAddress, min: 1n }),
 *   returnData: "0x",
 * });
 * console.log(error.code); // "SIMULATION_ASSERT_FAILED"
 * console.log(error.phase, error.returnData); // "before", "0x"
 * ```
 */
export class SimulationAssertError extends SimulationExecutionError {
  override readonly name = "SimulationAssertError";
  readonly code = "SIMULATION_ASSERT_FAILED";
  /** Zero-based index in the caller's transactions. */
  readonly transactionIndex: number;
  /** Whether the check ran before or after that transaction. */
  readonly phase: "before" | "after";
  /** Index in that transaction's `assertBefore` or `assertAfter` list. */
  readonly assertionIndex: number;
  /** A copy of the caller's assertion (`to`, `data`, and `check`). */
  readonly assertion: Assertion;
  /** Return data from the simulated assertion call, or revert data if it reverted. */
  readonly returnData: Hex;

  /**
   * Preserve the failed assertion, its transaction coordinates, and raw data.
   * @param message - Human-readable assertion failure or read-revert explanation.
   * @param failure - Failed assertion, its transaction coordinates, and raw call data.
   * @param failure.transactionIndex - Zero-based index in the caller's transactions.
   * @param failure.phase - Whether the assertion ran before or after the transaction.
   * @param failure.assertionIndex - Zero-based index in that phase's assertion list.
   * @param failure.assertion - Copy of the caller's assertion (`to`, `data`, and `check`).
   * @param failure.returnData - Raw return data, or revert data if the read reverted.
   * @param options - Optional original error cause.
   * @param options.cause - Optional error thrown by `check` or node error from a reverted read.
   */
  // biome-ignore lint/complexity/useMaxParams: public error constructor signature
  constructor(
    message: string,
    failure: {
      readonly transactionIndex: number;
      readonly phase: "before" | "after";
      readonly assertionIndex: number;
      readonly assertion: Assertion;
      readonly returnData: Hex;
    },
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.transactionIndex = failure.transactionIndex;
    this.phase = failure.phase;
    this.assertionIndex = failure.assertionIndex;
    this.assertion = failure.assertion;
    this.returnData = failure.returnData;
  }
}

/**
 * A caller-supplied `assertLogs` check did not hold for a simulated
 * transaction's emitted logs.
 *
 * Extends {@link SimulationExecutionError}.
 * @example
 * ```ts
 * import {
 *   SimulationLogAssertError,
 *   type RawLog,
 * } from "@morpho-org/evm-simulation";
 *
 * const error = new SimulationLogAssertError("Approval event is missing", {
 *   transactionIndex: 0,
 *   assertionIndex: 0,
 *   assertion: { check: (_logs: readonly RawLog[]) => "Approval event is missing" },
 *   logs: [],
 * });
 * console.log(error.code); // "SIMULATION_ASSERT_FAILED"
 * console.log(error.transactionIndex, error.logs);
 * ```
 */
export class SimulationLogAssertError extends SimulationExecutionError {
  /** Stable discriminator used by consumers that inspect `error.name`. */
  override readonly name = "SimulationLogAssertError";
  /** Shares the existing error code for read-assertion failures. */
  readonly code = "SIMULATION_ASSERT_FAILED";
  /** Zero-based index in the caller's transactions. */
  readonly transactionIndex: number;
  /** Index in that transaction's `assertLogs` list. */
  readonly assertionIndex: number;
  /** A copy of the caller's log assertion. */
  readonly assertion: LogAssertion;
  /** Lowercase log values passed to the check, in emission order. */
  readonly logs: readonly RawLog[];

  /**
   * Preserve the failed log assertion, its transaction coordinates, and the lowercase log values passed to the check.
   * @param message - Human-readable assertion failure or check-thrown explanation.
   * @param failure - Failed assertion, its transaction coordinates, and logs.
   * @param failure.transactionIndex - Zero-based index in the caller's transactions.
   * @param failure.assertionIndex - Zero-based index in that transaction's log assertions.
   * @param failure.assertion - Copy of the caller's log assertion (`check`).
   * @param failure.logs - Lowercase log values passed to the check.
   * @param options - Optional original error cause.
   * @param options.cause - Optional error thrown by the caller's check.
   */
  // biome-ignore lint/complexity/useMaxParams: public error constructor signature
  constructor(
    message: string,
    failure: {
      readonly transactionIndex: number;
      readonly assertionIndex: number;
      readonly assertion: LogAssertion;
      readonly logs: readonly RawLog[];
    },
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.transactionIndex = failure.transactionIndex;
    this.assertionIndex = failure.assertionIndex;
    this.assertion = { ...failure.assertion };
    this.logs = [...failure.logs];
  }
}

/** Per-asset net retained amount keyed by restricted contract and token. */
export interface RetainedAsset {
  /** Restricted bundles contract that ended up holding the token. */
  readonly address: Address;
  /** Token retained (native ETH uses viem's `ethAddress`). */
  readonly token: Address;
  /** Net balance increase in the token's base units; always positive. */
  readonly netRetained: bigint;
}

/**
 * Thrown when net value above the dust threshold is retained by a restricted bundles contract
 * (VaultExitBundlesV1, VaultBundlesV1, BlueBundlesV1 or MidnightBundlesV2) after simulation;
 * pass-through flows and net outflows are allowed. Never bypassable.
 * Extends {@link SimulationSafetyError}.
 */
export class BlacklistViolationError extends SimulationSafetyError {
  override readonly name = "BlacklistViolationError";
  readonly code = "BLACKLIST_ERROR";

  // biome-ignore lint/complexity/useMaxParams: public error constructor signature
  constructor(
    message: string,
    /** Per-asset net retained amounts keyed by restricted contract and token. */
    public readonly assetChanges?: readonly RetainedAsset[],
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/**
 * An RPC request failed, including transport, timeout, or non-revert node errors.
 * The original viem error is preserved as `cause`. This does not imply retryability;
 * services requiring simulation must withhold transactions on this failure.
 * Extends {@link SimulationInfrastructureError}.
 */
export class RpcTransportError extends SimulationInfrastructureError {
  override readonly name = "RpcTransportError";
  readonly code = "RPC_TRANSPORT_ERROR";
}

/** Bad input or a preview authorization preparation that emits asset transfers. Not bypassable. Extends {@link SimulationInvalidRequestError}. */
export class SimulationValidationError extends SimulationInvalidRequestError {
  override readonly name = "SimulationValidationError";
  readonly code = "VALIDATION_ERROR";

  // biome-ignore lint/complexity/useMaxParams: public error constructor signature
  constructor(
    message: string,
    public readonly fieldErrors?: string[],
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/**
 * The request needs a Morpho contract address that Morpho's address registry
 * does not list for the client's chain. Not bypassable.
 * Extends {@link SimulationInvalidRequestError}.
 */
export class UnsupportedChainError extends SimulationInvalidRequestError {
  override readonly name = "UnsupportedChainError";
  readonly code = "UNSUPPORTED_CHAIN";

  constructor(
    public readonly chainId: number,
    options?: ErrorOptions,
  ) {
    super(
      `Chain ${chainId} lacks a Morpho address this simulation needs in Morpho's address registry. Simulate on a chain where the required Morpho contracts are deployed.`,
      options,
    );
  }
}

/**
 * An SDK requirement passed to `toSimulationAuthorizations` cannot be
 * converted into a simulation authorization.
 * Extends {@link SimulationInvalidRequestError}.
 */
export class UnsupportedOperationError extends SimulationInvalidRequestError {
  override readonly name = "UnsupportedOperationError";
  readonly code = "UNSUPPORTED_OPERATION";
}

/**
 * The simulation backend returned a response that cannot be parsed.
 * Extends {@link SimulationInfrastructureError}.
 */
export class InvalidSimulationResponseError extends SimulationInfrastructureError {
  override readonly name = "InvalidSimulationResponseError";
  readonly code = "INVALID_SIMULATION_RESPONSE";
}

/** Reasons a slippage check lacks usable evidence. */
export const SLIPPAGE_CHECK_UNAVAILABLE_REASONS = [
  /** A required state or derivation read is missing or failed. */
  "missingRead",
  /** A read or resolved subject has no usable data. */
  "emptyData",
  /** An active quote side derives to zero. */
  "zeroDerivedAmount",
  /** A required event is absent from the simulation logs. */
  "missingEvent",
  /** An observed event cannot be paired with the required operation evidence. */
  "unmatchedEvent",
  /** Observed evidence belongs to a different account. */
  "accountMismatch",
  /** Native funding needs a wrapped-native token that the chain has not registered. */
  "noRegisteredWrappedNative",
] as const;

/** Reason a slippage limit could not be checked. */
export type SlippageCheckUnavailableReason =
  (typeof SLIPPAGE_CHECK_UNAVAILABLE_REASONS)[number];

/** Structured facts a {@link SlippageCheckUnavailableError} repeats from its message. */
export interface SlippageCheckUnavailable {
  /** Zero-based index in `limits.operations`; absent for bundle-wide or shared reads. */
  readonly operationIndex?: number;
  /** The operation's limit type; absent for bundle-wide or shared reads. */
  readonly operationType?: OperationType;
  /** Quote side, subject input or read whose evidence is unavailable. */
  readonly field: string;
  /** Why the evidence cannot be used. */
  readonly reason: SlippageCheckUnavailableReason;
}

/**
 * A slippage limit could not be checked because its quoted amount could not be read or measured.
 * Fields are optional because the constructor accepts a message alone; every
 * instance the SDK creates sets the reason and field, plus operation coordinates
 * for operation-scoped failures.
 * Extends {@link SimulationInfrastructureError}.
 */
export class SlippageCheckUnavailableError extends SimulationInfrastructureError {
  override readonly name = "SlippageCheckUnavailableError";
  readonly code = "SLIPPAGE_CHECK_UNAVAILABLE";

  /** Zero-based index in `limits.operations`, when scoped to one operation. */
  readonly operationIndex?: number;
  /** The operation's limit type, when scoped to one operation. */
  readonly operationType?: OperationType;
  /** Quote side, subject input or read whose evidence is unavailable. */
  readonly field?: string;
  /** Why the evidence cannot be used. */
  readonly reason?: SlippageCheckUnavailableReason;

  /**
   * @param message - Human-readable failure, unchanged by the structured facts.
   * @param options - Optional cause and structured evidence failure.
   */
  constructor(
    message: string,
    options?: ErrorOptions & Partial<SlippageCheckUnavailable>,
  ) {
    super(message, options);
    this.operationIndex = options?.operationIndex;
    this.operationType = options?.operationType;
    this.field = options?.field;
    this.reason = options?.reason;
  }
}

/** A sender-granted token approval or permit is not allowed by the request. Extends {@link SimulationSafetyError}. */
export class UnexpectedTokenApprovalError extends SimulationSafetyError {
  override readonly name = "UnexpectedTokenApprovalError";
  readonly code = "UNEXPECTED_TOKEN_APPROVAL";
  /** Token or NFT collection that emitted or would receive the approval. */
  readonly token: Address;
  /** Account granting the approval. */
  readonly owner: Address;
  /** Account receiving approval authority. */
  readonly spender: Address;
  /** `"event"` is a grant in simulated logs; `"authorization"` is a pending preview request checked before `eth_simulateV1`. */
  readonly source: "event" | "authorization";
  /** Whether callers may add this permission to `limits.approvals`. */
  readonly allowlistable: boolean;

  constructor(params: {
    readonly token: Address;
    readonly owner: Address;
    readonly spender: Address;
    readonly source: "event" | "authorization";
    readonly allowlistable?: boolean;
  }) {
    super(
      params.allowlistable === false
        ? `Approval for "${params.token}" from "${params.owner}" to "${params.spender}" is not part of any supported operation and cannot be added to limits.approvals. Do not sign this request.`
        : `Token approval for "${params.token}" from "${params.owner}" to "${params.spender}" is not part of the requested operation. Do not sign this request; if the approval is intended, add it to limits.approvals.`,
    );
    this.token = params.token;
    this.owner = params.owner;
    this.spender = params.spender;
    this.source = params.source;
    this.allowlistable = params.allowlistable ?? true;
  }
}

/** A sender-granted Morpho authorization is not allowed by the request. Extends {@link SimulationSafetyError}. */
export class UnexpectedMorphoAuthorizationError extends SimulationSafetyError {
  override readonly name = "UnexpectedMorphoAuthorizationError";
  readonly code = "UNEXPECTED_MORPHO_AUTHORIZATION";
  /** Account granting Morpho authorization. */
  readonly authorizer: Address;
  /** Account receiving Morpho authorization. */
  readonly authorized: Address;
  /** `"event"` is a grant in simulated logs; `"authorization"` is a pending preview request checked before `eth_simulateV1`. */
  readonly source: "event" | "authorization";
  /** Whether callers may add this permission to `limits.approvals`. */
  readonly allowlistable: boolean;

  constructor(params: {
    readonly authorizer: Address;
    readonly authorized: Address;
    readonly source: "event" | "authorization";
    readonly allowlistable?: boolean;
  }) {
    super(
      params.allowlistable === false
        ? `Morpho authorization from "${params.authorizer}" to "${params.authorized}" is not part of any supported operation and cannot be added to limits.approvals. Do not sign this request.`
        : `Morpho authorization from "${params.authorizer}" to "${params.authorized}" is not part of the requested operation. Do not sign this request; if the authorization is intended, add it to limits.approvals.`,
    );
    this.authorizer = params.authorizer;
    this.authorized = params.authorized;
    this.source = params.source;
    this.allowlistable = params.allowlistable ?? true;
  }
}

/** A sender-granted Midnight authorization is not allowed by the request. Extends {@link SimulationSafetyError}. */
export class UnexpectedMidnightAuthorizationError extends SimulationSafetyError {
  override readonly name = "UnexpectedMidnightAuthorizationError";
  readonly code = "UNEXPECTED_MIDNIGHT_AUTHORIZATION";
  /** Midnight account whose control is granted. */
  readonly onBehalf: Address;
  /** Account receiving full control of `onBehalf`'s Midnight account. */
  readonly authorized: Address;
  /** Whether callers may add this permission to `limits.approvals`. */
  readonly allowlistable: boolean;

  constructor(params: {
    readonly onBehalf: Address;
    readonly authorized: Address;
    readonly allowlistable?: boolean;
  }) {
    super(
      params.allowlistable === false
        ? `Midnight authorization from "${params.onBehalf}" to "${params.authorized}" is not part of any supported operation and cannot be added to limits.approvals. Do not sign this request.`
        : `Midnight authorization from "${params.onBehalf}" to "${params.authorized}" is not part of the requested operation. Do not sign this request; if the authorization is intended, add it to limits.approvals.`,
    );
    this.onBehalf = params.onBehalf;
    this.authorized = params.authorized;
    this.allowlistable = params.allowlistable ?? true;
  }
}

/** Approval or authorization evidence for a valid request could not be resolved or decoded safely. Extends {@link SimulationInfrastructureError}. */
export class ApprovalCheckUnavailableError extends SimulationInfrastructureError {
  override readonly name = "ApprovalCheckUnavailableError";
  readonly code = "APPROVAL_CHECK_UNAVAILABLE";

  constructor(
    message = "Approval checks could not be completed. Confirm the chain registry and token contracts are available, then try again.",
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** A pending authorization does not match the request it was prepared for. Extends {@link SimulationInvalidRequestError}. */
export class AuthorizationRequestMismatchError extends SimulationInvalidRequestError {
  override readonly name = "AuthorizationRequestMismatchError";
  readonly code = "AUTHORIZATION_REQUEST_MISMATCH";
}

/**
 * Kinds of check a {@link ConsumerLimitViolationError} reports in `check`:
 * - `slippageTolerance`: a quoted amount or share price is past its quote
 *   adjusted by the percentage tolerance.
 * - `derivedBound`: an amount is past a minimum or maximum derived from typed
 *   inputs, including the subject-share rounding allowance.
 * - `exactQuote`: an amount breaks an exact input or quote: it differs from it,
 *   or a Midnight collateral credit falls below it.
 * - `inactiveLeg`: an inactive combined-operation leg moved adversely.
 * - `noMovement`: a quoted position or share-price pair did not move.
 * - `unquotedMarket`: a force exit deallocated from a market the quote omits.
 * - `positionBound`: a post-bundle position is past its declared bound.
 * - `unchangedState`: an undeclared position, debt or credit change on a side
 *   the operation must leave unchanged or must not move adversely.
 * - `shareTransfer`: an outgoing vault-share transfer would count toward an
 *   exact `sharesBurned`.
 */
export const CONSUMER_LIMIT_CHECKS = [
  "slippageTolerance",
  "derivedBound",
  "exactQuote",
  "inactiveLeg",
  "noMovement",
  "unquotedMarket",
  "positionBound",
  "unchangedState",
  "shareTransfer",
] as const;

/** Kind of check a {@link ConsumerLimitViolationError} failed. */
export type ConsumerLimitCheck = (typeof CONSUMER_LIMIT_CHECKS)[number];

/**
 * Limit side a {@link ConsumerLimitViolationError} reports in `field`: a
 * {@link SlippageQuote} field, `sharePrice`, a `position.*` bound, a Blue
 * position side (`supplyShares`, `borrowShares`, `collateral`), Midnight
 * `debt` or `credit`, or `walletBalance` for a net wallet bound.
 */
export type ConsumerLimitField =
  | keyof SlippageQuote
  | "sharePrice"
  | "position.maxBorrowShares"
  | "position.minSupplyShares"
  | "position.minCollateral"
  | "position.maxCredit"
  | "position.maxDebt"
  | "position.maxCollateral"
  | "supplyShares"
  | "borrowShares"
  | "collateral"
  | "debt"
  | "credit"
  | "walletBalance";

/**
 * The failing entry of a quote or bound with several entries, named by the key
 * the entry carries: `marketId` for `positions` and `deallocations`,
 * `collateralIndex` for `collateralSupplies`, `collateralWithdrawals` and
 * `position.maxCollateral`, `token` and `account` for `walletBalance`.
 */
export type ConsumerLimitEntry =
  | { readonly marketId: MarketId }
  | { readonly collateralIndex: bigint }
  | { readonly token: Address; readonly account: Address };

/** Structured facts a {@link ConsumerLimitViolationError} repeats from its message. */
export interface ConsumerLimitViolation {
  /** Zero-based index in `limits.operations`. */
  readonly operationIndex: number;
  /** The operation's limit type. */
  readonly operationType: OperationType;
  /** The limit side that failed. */
  readonly field: ConsumerLimitField;
  /** The kind of check that failed. */
  readonly check: ConsumerLimitCheck;
  /** The quoted, derived or declared value, or the value before the bundle for `unchangedState`; `0n` for `inactiveLeg`, `shareTransfer` and `unquotedMarket`. */
  readonly expected: bigint;
  /** The observed value; `0n` shares for a share-price `noMovement`. */
  readonly observed: bigint;
  /** WAD-scaled percentage tolerance the check applied, when it applies one. */
  readonly tolerance?: bigint;
  /** The allowed minimum or maximum the observed value was compared to, when the check applies one. */
  readonly bound?: bigint;
  /** The failing entry when the quote or bound has several entries; undefined for single-value sides. */
  readonly entry?: ConsumerLimitEntry;
}

/**
 * A consumer-supplied limit was violated. The fields repeat what the message
 * says. They are optional because the constructor accepts a message alone;
 * every instance `simulate` reports sets them.
 * Extends {@link SimulationExecutionError}.
 *
 * @example
 * ```ts
 * import { ConsumerLimitViolationError } from "@morpho-org/evm-simulation";
 *
 * const error = new ConsumerLimitViolationError("Limit operation 0 (vaultV1Deposit): ...", {
 *   operationIndex: 0,
 *   operationType: "vaultV1Deposit",
 *   field: "sharesMinted",
 *   check: "slippageTolerance",
 *   expected: 1000n,
 *   observed: 980n,
 *   tolerance: 10000000000000000n,
 *   bound: 990n,
 * });
 * console.log(error.code, error.check, error.field); // "CONSUMER_LIMIT_VIOLATION", "slippageTolerance", "sharesMinted"
 * ```
 */
export class ConsumerLimitViolationError extends SimulationExecutionError {
  override readonly name = "ConsumerLimitViolationError";
  readonly code = "CONSUMER_LIMIT_VIOLATION";

  /** Zero-based index in `limits.operations`. */
  readonly operationIndex?: number;
  /** The operation's limit type. */
  readonly operationType?: OperationType;
  /** The limit side that failed. */
  readonly field?: ConsumerLimitField;
  /** The kind of check that failed. */
  readonly check?: ConsumerLimitCheck;
  /** The quoted, derived or declared value the check compared against, or the value before the bundle for `unchangedState`. */
  readonly expected?: bigint;
  /** The observed value. */
  readonly observed?: bigint;
  /** WAD-scaled percentage tolerance the check applied, when it applies one. */
  readonly tolerance?: bigint;
  /** The allowed minimum or maximum, when the check applies one. */
  readonly bound?: bigint;
  /** The failing entry when the quote or bound has several entries; undefined for single-value sides. */
  readonly entry?: ConsumerLimitEntry;

  /**
   * @param message - Human-readable failure naming the operation, side and values.
   * @param options - Optional cause and the structured violation facts.
   */
  constructor(
    message: string,
    options?: ErrorOptions & Partial<ConsumerLimitViolation>,
  ) {
    super(message, options);
    this.operationIndex = options?.operationIndex;
    this.operationType = options?.operationType;
    this.field = options?.field;
    this.check = options?.check;
    this.expected = options?.expected;
    this.observed = options?.observed;
    this.tolerance = options?.tolerance;
    this.bound = options?.bound;
    this.entry = options?.entry;
  }
}

/** The simulation failed for a reason that fits no other code. Extends {@link SimulationInfrastructureError}. */
export class UnexpectedSimulationError extends SimulationInfrastructureError {
  override readonly name = "UnexpectedSimulationError";
  readonly code = "UNEXPECTED_SIMULATION_ERROR";
}

/**
 * An action's encoded recipient differs from the account `toSimulationLimits`
 * was asked to limit: `args.onBehalf` is not `owner`, or not
 * `options.onBehalf ?? owner` on `midnightSupplyCollateral` or `midnightRedeem`
 * (`field: "onBehalf"`),
 * `redeem.recipient` on `vaultV2ForceRedeem` is not `receiver ?? owner`
 * (`field: "redeem.recipient"`), a `receiver` other than `owner` is passed
 * for an action that encodes no distinct receiver (`field: "receiver"`),
 * `args.receiver` on `midnightRedeem`, `midnightTakeBorrow`,
 * `midnightSupplyCollateralTakeBorrow`, or `midnightTakeWithdraw` is not
 * `receiver ?? owner` (`field: "args.receiver"`),
 * `args.collateralReceiver` on `midnightRepayWithdrawCollateral` or
 * `midnightTakeRepayWithdrawCollateral` is not
 * `receiver ?? owner` (`field: "args.collateralReceiver"`),
 * or `onBehalf` other than `owner` is passed for an action other than
 * `midnightSupplyCollateral` or `midnightRedeem` (`field: "options.onBehalf"`).
 * Extends {@link SimulationInvalidRequestError}.
 */
export class LimitAccountMismatchError extends SimulationInvalidRequestError {
  override readonly name = "LimitAccountMismatchError";
  readonly code = "LIMIT_ACCOUNT_MISMATCH";

  /** The action arg or `toSimulationLimits` option carrying the mismatched address. */
  readonly field:
    | "onBehalf"
    | "receiver"
    | "redeem.recipient"
    | "options.onBehalf"
    | "args.receiver"
    | "args.collateralReceiver";
  /**
   * The address the limit would measure: `options.onBehalf ?? owner` for
   * `onBehalf` on `midnightSupplyCollateral` and `midnightRedeem`,
   * `options.receiver ?? owner` for `args.receiver` on Midnight redeem/sell
   * actions and `args.collateralReceiver` on Midnight repay-withdraw, otherwise
   * `owner` (or `receiver ?? owner` for `redeem.recipient`).
   */
  readonly expected: Address;
  /** The address the action encodes, or the passed option when `field` is `"receiver"` or `"options.onBehalf"`. */
  readonly actual: Address;

  constructor(mismatch: {
    /** The action arg or `toSimulationLimits` option carrying the mismatched address. */
    readonly field:
      | "onBehalf"
      | "receiver"
      | "redeem.recipient"
      | "options.onBehalf"
      | "args.receiver"
      | "args.collateralReceiver";
    /**
     * The address the limit would measure: `options.onBehalf ?? owner` for
     * `onBehalf` on `midnightSupplyCollateral` and `midnightRedeem`,
     * `options.receiver ?? owner` for `args.receiver` on Midnight redeem/sell
     * actions and `args.collateralReceiver` on Midnight repay-withdraw, otherwise
     * `owner` (or `receiver ?? owner` for `redeem.recipient`).
     */
    readonly expected: Address;
    /** The address the action encodes, or the passed option when `field` is `"receiver"` or `"options.onBehalf"`. */
    readonly actual: Address;
  }) {
    super(
      mismatch.field === "receiver"
        ? `receiver: "${mismatch.actual}" was passed, but this action pays ` +
            `msg.sender, so the limit measures "${mismatch.expected}". Omit ` +
            `receiver or set it to owner; only vaultV2ForceRedeem, ` +
            `midnightRedeem, midnightTakeBorrow, ` +
            `midnightSupplyCollateralTakeBorrow, midnightTakeWithdraw and a ` +
            `collateral-withdrawing midnightRepayWithdrawCollateral or ` +
            `midnightTakeRepayWithdrawCollateral encode a distinct receiver.`
        : mismatch.field === "options.onBehalf"
          ? `onBehalf: "${mismatch.actual}" was passed, but this action ` +
            `credits msg.sender, so the limit measures "${mismatch.expected}". ` +
            `Omit onBehalf or set it to owner; only midnightSupplyCollateral ` +
            `and midnightRedeem act on a distinct account.`
          : `${mismatch.field}: action encodes "${mismatch.actual}" but the ` +
            `limit measures "${mismatch.expected}". Build the action for the ` +
            `same account passed as owner/receiver, or as onBehalf on ` +
            `midnightSupplyCollateral or midnightRedeem`,
    );
    this.field = mismatch.field;
    this.expected = mismatch.expected;
    this.actual = mismatch.actual;
  }
}

/**
 * A quote side `toSimulationLimits` cannot derive from the action args and the
 * caller did not supply through `expected`.
 * Extends {@link SimulationInvalidRequestError}.
 */
export class MissingExpectedQuoteError extends SimulationInvalidRequestError {
  override readonly name = "MissingExpectedQuoteError";
  readonly code = "MISSING_EXPECTED_QUOTE";

  /** The action type whose limit lacks the field. */
  readonly actionType: string;
  /** The missing `SlippageQuote` field. */
  readonly field: keyof SlippageQuote;
  /** What the caller should compute and pass via `expected`. */
  readonly expectedHint: string;

  constructor(missing: {
    /** The action type whose limit lacks the field. */
    readonly actionType: string;
    /** The missing `SlippageQuote` field. */
    readonly field: keyof SlippageQuote;
    /** What the caller should compute and pass via `expected`. */
    readonly expectedHint: string;
  }) {
    super(
      `"${missing.actionType}": quote.${missing.field} cannot be derived from ` +
        `the action args; ${missing.expectedHint}`,
    );
    this.actionType = missing.actionType;
    this.field = missing.field;
    this.expectedHint = missing.expectedHint;
  }
}

/**
 * An expected quote cannot be assigned to each of a maker action's
 * per-collateral-index operations.
 * Extends {@link SimulationInvalidRequestError}.
 */
export class AmbiguousExpectedQuoteError extends SimulationInvalidRequestError {
  override readonly name = "AmbiguousExpectedQuoteError";
  readonly code = "AMBIGUOUS_EXPECTED_QUOTE";

  /** The action type whose expected quote is ambiguous. */
  readonly actionType: string;
  /** The number of independently verified collateral-index operations. */
  readonly operations: number;

  /**
   * @param ambiguity - The action type and number of operations that need separate quotes.
   */
  constructor(ambiguity: {
    /** The action type whose expected quote is ambiguous. */
    readonly actionType: string;
    /** The number of independently verified collateral-index operations. */
    readonly operations: number;
  }) {
    super(
      `"${ambiguity.actionType}": expected cannot be attributed: the action ` +
        `supplies ${ambiguity.operations} collateral indexes, each verified as ` +
        `its own operation. Omit expected, or build the limits by hand.`,
    );
    this.actionType = ambiguity.actionType;
    this.operations = ambiguity.operations;
  }
}

/** An action type `toSimulationLimits` has no {@link OperationType} for. Extends {@link SimulationInvalidRequestError}. */
export class UnsupportedLimitActionError extends SimulationInvalidRequestError {
  override readonly name = "UnsupportedLimitActionError";
  readonly code = "UNSUPPORTED_LIMIT_ACTION";

  constructor(
    /** The action type passed in. */
    public readonly actionType: string,
  ) {
    super(
      `"${actionType}": no simulation limit exists for this action type. ` +
        `Pass limits built by hand, or "none" for transactions no operation type covers`,
    );
  }
}

const ERROR_NAME_BY_CODE: Readonly<
  Record<SimulationErrorCode, readonly string[]>
> = Object.freeze({
  VALIDATION_ERROR: ["SimulationValidationError"],
  UNSUPPORTED_CHAIN: ["UnsupportedChainError"],
  RPC_TRANSPORT_ERROR: ["RpcTransportError"],
  SIMULATION_REVERTED: ["SimulationRevertedError"],
  SIMULATION_ASSERT_FAILED: [
    "SimulationAssertError",
    "SimulationLogAssertError",
  ],
  BLACKLIST_ERROR: ["BlacklistViolationError"],
  UNSUPPORTED_OPERATION: ["UnsupportedOperationError"],
  INVALID_SIMULATION_RESPONSE: ["InvalidSimulationResponseError"],
  SLIPPAGE_CHECK_UNAVAILABLE: ["SlippageCheckUnavailableError"],
  AUTHORIZATION_REQUEST_MISMATCH: ["AuthorizationRequestMismatchError"],
  CONSUMER_LIMIT_VIOLATION: ["ConsumerLimitViolationError"],
  UNEXPECTED_SIMULATION_ERROR: ["UnexpectedSimulationError"],
  LIMIT_ACCOUNT_MISMATCH: ["LimitAccountMismatchError"],
  MISSING_EXPECTED_QUOTE: ["MissingExpectedQuoteError"],
  AMBIGUOUS_EXPECTED_QUOTE: ["AmbiguousExpectedQuoteError"],
  UNSUPPORTED_LIMIT_ACTION: ["UnsupportedLimitActionError"],
  UNEXPECTED_TOKEN_APPROVAL: ["UnexpectedTokenApprovalError"],
  UNEXPECTED_MORPHO_AUTHORIZATION: ["UnexpectedMorphoAuthorizationError"],
  UNEXPECTED_MIDNIGHT_AUTHORIZATION: ["UnexpectedMidnightAuthorizationError"],
  APPROVAL_CHECK_UNAVAILABLE: ["ApprovalCheckUnavailableError"],
  UNUSED_AUTHORIZATION: ["UnusedAuthorizationError"],
});

/**
 * Structural guard for consumers where `instanceof` fails across bundles.
 *
 * @param value - Anything caught.
 * @returns `true` for package instances or objects carrying a message string,
 *   a known code and one of its matching class names. Subclass-specific fields
 *   are not checked. `severity` must be `"fatal"`, `"error"` or `"warn"`.
 * @example
 * ```ts
 * import { isSimulationPackageError } from "@morpho-org/evm-simulation";
 *
 * // An error from another bundled copy of this package, where `instanceof` fails.
 * // A worker's structured clone drops `code` and `severity`; post a plain object instead.
 * declare const received: unknown;
 * if (isSimulationPackageError(received)) {
 *   console.log(received.code, received.severity, received.message);
 * }
 * ```
 */
export function isSimulationPackageError(
  value: unknown,
): value is SimulationPackageError {
  if (typeof value !== "object" || value === null) return false;
  if (value instanceof SimulationPackageError) return true;
  const { name, message, code } = value as {
    name?: unknown;
    message?: unknown;
    code?: unknown;
  };
  if (typeof message !== "string") return false;
  if (typeof name !== "string" || typeof code !== "string") return false;
  if (!(SIMULATION_ERROR_CODES as readonly string[]).includes(code))
    return false;
  if (!ERROR_NAME_BY_CODE[code as SimulationErrorCode].includes(name))
    return false;
  const { severity } = value as { severity?: unknown };
  return severity === "fatal" || severity === "error" || severity === "warn";
}
