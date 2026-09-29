import type { MarketId } from "@morpho-org/blue-sdk";
import type { Address, Hash } from "viem";
import type { OperationType } from "./limits.js";
import type { SimulationMode } from "./params.js";

/** Stable error codes thrown by this package, part of the public API. */
export const SIMULATION_ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNSUPPORTED_CHAIN",
  "EXTERNAL_SERVICE_ERROR",
  "SIMULATION_REVERTED",
  "BLACKLIST_ERROR",
  "UNSUPPORTED_OPERATION",
  "PROTOCOL_BINDING_MISMATCH",
  "UNSUPPORTED_VERIFICATION_FEATURE",
  "INVALID_SIMULATION_RESPONSE",
  "MISSING_VERIFICATION_EVIDENCE",
  "AUTHORIZATION_REQUEST_MISMATCH",
  "ASSET_CHANGE_MISMATCH",
  "PERMISSION_CHANGE_MISMATCH",
  "STATE_CHANGE_MISMATCH",
  "MARKET_CONSTRAINT_VIOLATION",
  "SLIPPAGE_LIMIT_EXCEEDED",
  "FEE_MISMATCH",
  "CONSUMER_LIMIT_VIOLATION",
  "UNEXPECTED_SIMULATION_ERROR",
] as const;

/** Stable string discriminator for log aggregation and external mapping. */
export type SimulationErrorCode = (typeof SIMULATION_ERROR_CODES)[number];

/**
 * Machine-readable cause of an execution failure (ADR-2026-09-18 §Errors).
 * `UNKNOWN_REVERT` is used when the revert maps to no known Morpho condition;
 * consumers branch on it and never parse `reason`.
 */
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

/** Pipeline stage a failure belongs to; `transport` covers RPC and response failures. */
export type SimulationStage =
  | "validation"
  | "preparation"
  | "execution"
  | "verification"
  | "transport";

interface SimulationContextBase {
  /** Request mode the failure happened in. */
  readonly mode: SimulationMode;
  /** Chain the request targeted. */
  readonly chainId: number;
  /** Block the simulation was pinned to. */
  readonly blockNumber: bigint;
}

interface SimulationOperationContext extends SimulationContextBase {
  /** Decoded operation being executed or verified. */
  readonly operation: OperationType;
  /** Blue market the operation acts on. */
  readonly marketId?: MarketId;
  /** Vault the operation acts on. */
  readonly vault?: Address;
  /** Vault V2 adapter the operation routes through. */
  readonly adapter?: Address;
  /** Token whose balance, allowance or transfer was checked. */
  readonly token?: Address;
  /** Account whose position, balance or authorization was checked (usually the sender). */
  readonly account?: Address;
  /** Spender or operator granted by the checked permission. */
  readonly spender?: Address;
  /** Name of the checked field; its suffix gives the unit (e.g. "maxLtvAfterWad"). */
  readonly field?: string;
  /** Bound or value `field` was checked against; 32-byte hashes only, never calldata or signatures. */
  readonly expected?: bigint | boolean | Address | Hash;
  /** Value observed in the simulation, same domain as `expected`. */
  readonly observed?: bigint | boolean | Address | Hash;
  /** Index into the caller's `transactions`; preview preparation never shifts it. */
  readonly failedTransactionIndex?: number;
}

/**
 * Where and why a simulation failed, keyed by `stage` (ADR-2026-09-18 §Errors).
 * Every stage carries `mode`, `chainId` and `blockNumber`. Never contains
 * signatures, RPC URLs, credentials, raw calldata or raw causes (`cause` stays
 * on the error).
 */
export type SimulationErrorContext =
  | (SimulationContextBase & { readonly stage: "validation" })
  | (SimulationContextBase & { readonly stage: "transport" })
  | (SimulationContextBase & {
      readonly stage: "preparation";
      /** Index into `authorizations`. */
      readonly authorizationIndex: number;
      /** Index into that authorization's preparation calls. */
      readonly preparationCallIndex?: number;
    })
  | (SimulationOperationContext & { readonly stage: "execution" })
  | (SimulationOperationContext & { readonly stage: "verification" });

/**
 * Base class for every error this package throws. Transport-agnostic — no HTTP status codes.
 * Consumers pattern-match with `instanceof` on the concrete subclass.
 */
export abstract class SimulationPackageError extends Error {
  /** Stable string discriminator for log aggregation and external mapping. */
  abstract readonly code: SimulationErrorCode;

  /** Frozen copy of the failure context, when one was supplied. */
  readonly context?: SimulationErrorContext;

  constructor(
    message: string,
    options?: ErrorOptions & { context?: SimulationErrorContext },
  ) {
    const { context, ...errorOptions } = options ?? {};
    super(message, errorOptions);
    this.name = this.constructor.name;
    if (context !== undefined) {
      this.context = Object.freeze({ ...context });
    }
  }
}

/** Transaction would revert on-chain. Not bypassable. */
export class SimulationRevertedError extends SimulationPackageError {
  readonly code = "SIMULATION_REVERTED";

  // biome-ignore lint/complexity/useMaxParams: public error constructor signature
  constructor(
    /** Raw revert string as reported by the backend, when any. */
    public readonly reason: string | undefined,
    public readonly details?: unknown,
    /** Machine-readable cause; `UNKNOWN_REVERT` when the revert maps to no known Morpho condition. */
    public readonly reasonCode: SimulationExecutionReason = "UNKNOWN_REVERT",
    /** Which transaction/authorization reverted and the operation it belonged to. */
    context?: Extract<
      SimulationErrorContext,
      { stage: "preparation" | "execution" }
    >,
  ) {
    super(
      reason ?? "Transaction simulation reverted",
      details instanceof Error ? { cause: details, context } : { context },
    );
  }
}

/** Per-asset net retained amount keyed by restricted contract and token. */
export interface RetainedAsset {
  readonly address: Address;
  readonly token: Address;
  readonly netRetained: bigint;
}

/**
 * Thrown when net value above the dust threshold is retained by a restricted bundles contract
 * (VaultExitBundlesV1, VaultBundlesV1, BlueBundlesV1 or MidnightBundlesV1) after simulation;
 * pass-through flows and net outflows are allowed. Never bypassable.
 */
export class BlacklistViolationError extends SimulationPackageError {
  readonly code = "BLACKLIST_ERROR";

  // biome-ignore lint/complexity/useMaxParams: public error constructor signature
  constructor(
    message: string,
    /** Per-asset net retained amounts keyed by restricted contract and token. */
    public readonly assetChanges?: readonly RetainedAsset[],
    context?: SimulationErrorContext,
  ) {
    super(message, { context });
  }
}

/** RPC service is down or unreachable. Bypassable — user can proceed. */
export class ExternalServiceError extends SimulationPackageError {
  readonly code = "EXTERNAL_SERVICE_ERROR";
}

/** Bad input to the simulation functions. Not bypassable. */
export class SimulationValidationError extends SimulationPackageError {
  readonly code = "VALIDATION_ERROR";

  // biome-ignore lint/complexity/useMaxParams: public error constructor signature
  constructor(
    message: string,
    public readonly fieldErrors?: string[],
    context?: SimulationErrorContext,
  ) {
    super(message, { context });
  }
}

/** Chain ID not configured for any simulation method. Not bypassable. */
export class UnsupportedChainError extends SimulationPackageError {
  readonly code = "UNSUPPORTED_CHAIN";

  constructor(
    public readonly chainId: number,
    context?: SimulationErrorContext,
  ) {
    super(`Chain ${chainId} is not configured for simulation`, { context });
  }
}

/** Base for verification failures: the context is required and carries where the check failed. */
export abstract class SimulationVerificationError extends SimulationPackageError {
  declare readonly context: SimulationErrorContext;

  // biome-ignore lint/complexity/useMaxParams: public error constructor signature
  constructor(
    message: string,
    context: SimulationErrorContext,
    options?: ErrorOptions,
  ) {
    super(message, { ...options, context });
  }
}

/** A decoded transaction maps to no supported operation. */
export class UnsupportedOperationError extends SimulationVerificationError {
  readonly code = "UNSUPPORTED_OPERATION";
}

/** An operation does not match the protocol entity it was bound to. */
export class ProtocolBindingMismatchError extends SimulationVerificationError {
  readonly code = "PROTOCOL_BINDING_MISMATCH";
}

/** The request requires a verification feature this version does not support. */
export class UnsupportedVerificationFeatureError extends SimulationVerificationError {
  readonly code = "UNSUPPORTED_VERIFICATION_FEATURE";
}

/** The simulation backend returned a response that cannot be parsed. */
export class InvalidSimulationResponseError extends SimulationVerificationError {
  readonly code = "INVALID_SIMULATION_RESPONSE";
}

/** State needed to verify an operation could not be fetched or derived. */
export class MissingVerificationEvidenceError extends SimulationVerificationError {
  readonly code = "MISSING_VERIFICATION_EVIDENCE";
}

/** A pending authorization does not match the request it was prepared for. */
export class AuthorizationRequestMismatchError extends SimulationVerificationError {
  readonly code = "AUTHORIZATION_REQUEST_MISMATCH";
}

/** An observed asset change violates the expected bounds. */
export class AssetChangeMismatchError extends SimulationVerificationError {
  readonly code = "ASSET_CHANGE_MISMATCH";
}

/** An observed permission change (allowance or authorization) violates the expected bounds. */
export class PermissionChangeMismatchError extends SimulationVerificationError {
  readonly code = "PERMISSION_CHANGE_MISMATCH";
}

/** An observed state change violates the expected bounds. */
export class StateChangeMismatchError extends SimulationVerificationError {
  readonly code = "STATE_CHANGE_MISMATCH";
}

/** An operation left a market outside its allowed constraints. */
export class MarketConstraintViolationError extends SimulationVerificationError {
  readonly code = "MARKET_CONSTRAINT_VIOLATION";
}

/** An asset/share conversion exceeded the allowed slippage. */
export class SlippageLimitExceededError extends SimulationVerificationError {
  readonly code = "SLIPPAGE_LIMIT_EXCEEDED";
}

/** An observed fee differs from the expected amount. */
export class FeeMismatchError extends SimulationVerificationError {
  readonly code = "FEE_MISMATCH";
}

/** A consumer-supplied limit was violated. */
export class ConsumerLimitViolationError extends SimulationVerificationError {
  readonly code = "CONSUMER_LIMIT_VIOLATION";
}

/** The simulation failed for a reason that fits no other code. */
export class UnexpectedSimulationError extends SimulationVerificationError {
  readonly code = "UNEXPECTED_SIMULATION_ERROR";
}

const SIMULATION_STAGES: readonly string[] = [
  "validation",
  "preparation",
  "execution",
  "verification",
  "transport",
];

/**
 * Structural guard for consumers where `instanceof` fails across bundles.
 *
 * @param value - Anything caught.
 * @returns `true` for `SimulationPackageError` instances and for objects
 *   carrying `name`/`message` strings, a known `code` and an absent or
 *   well-formed `context` (known `stage`, `mode`, numeric `chainId`).
 * @example
 * ```ts
 * import { isSimulationPackageError, simulate } from "@morpho-org/evm-simulation";
 *
 * const config = {
 *   chains: new Map([[1, { simulateV1Url: "https://rpc.example" }]]),
 * };
 * try {
 *   await simulate(config, { chainId: 1, transactions: [] });
 * } catch (e) {
 *   if (!isSimulationPackageError(e)) throw e;
 *   if (e instanceof SimulationRevertedError) console.log(e.reasonCode);
 * }
 * ```
 */
export function isSimulationPackageError(
  value: unknown,
): value is SimulationPackageError {
  if (value instanceof SimulationPackageError) return true;
  if (typeof value !== "object" || value === null) return false;
  const { name, message, code, context } = value as {
    name?: unknown;
    message?: unknown;
    code?: unknown;
    context?: unknown;
  };
  if (typeof name !== "string" || typeof message !== "string") return false;
  if (
    typeof code !== "string" ||
    !(SIMULATION_ERROR_CODES as readonly string[]).includes(code)
  )
    return false;
  if (context === undefined) return true;
  if (typeof context !== "object" || context === null || Array.isArray(context))
    return false;
  const { stage, mode, chainId } = context as {
    stage?: unknown;
    mode?: unknown;
    chainId?: unknown;
  };
  return (
    typeof stage === "string" &&
    SIMULATION_STAGES.includes(stage) &&
    (mode === "preview" || mode === "final") &&
    typeof chainId === "number"
  );
}
