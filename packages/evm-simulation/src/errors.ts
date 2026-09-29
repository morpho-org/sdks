import type { MarketId } from "@morpho-org/blue-sdk";
import type { Address, Hex } from "viem";
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

/** Coarse classification of why a simulated transaction reverted. */
export type SimulationRevertReason =
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

/** Pipeline stage where a simulation failed. */
export type SimulationErrorStage =
  | "validation"
  | "preparation"
  | "execution"
  | "verification"
  | "transport";

/**
 * Where and why a simulation failed. Never contains signatures, RPC URLs,
 * credentials, raw calldata or raw causes (`cause` stays on the error).
 */
export interface SimulationErrorContext {
  readonly stage: SimulationErrorStage;
  readonly mode: SimulationMode;
  readonly chainId: number;
  /** Unset when the failure happens before the block is resolved. */
  readonly blockNumber?: bigint;
  readonly operation?: OperationType;
  readonly marketId?: MarketId;
  readonly vault?: Address;
  readonly adapter?: Address;
  readonly token?: Address;
  readonly account?: Address;
  readonly spender?: Address;
  /** Name of the checked field; its suffix gives the unit (e.g. "maxLtvAfterWad"). */
  readonly field?: string;
  readonly expected?: bigint | boolean | Hex;
  readonly observed?: bigint | boolean | Hex;
  /** Index into the caller's `transactions`. */
  readonly failedTransactionIndex?: number;
  /** Index into `authorizations`. */
  readonly authorizationIndex?: number;
  /** Index into that authorization's preparation calls. */
  readonly preparationCallIndex?: number;
}

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
    public readonly reason: string | undefined,
    public readonly details?: unknown,
    public readonly reasonCode: SimulationRevertReason = "UNKNOWN_REVERT",
    context?: SimulationErrorContext,
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
    public readonly assetChanges?: RetainedAsset[],
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

/** A decoded transaction maps to no supported operation. */
export class UnsupportedOperationError extends SimulationPackageError {
  readonly code = "UNSUPPORTED_OPERATION";

  // biome-ignore lint/complexity/useMaxParams: public error constructor signature
  constructor(
    message: string,
    context: SimulationErrorContext,
    options?: ErrorOptions,
  ) {
    super(message, { ...options, context });
  }
}

/** An operation does not match the protocol entity it was bound to. */
export class ProtocolBindingMismatchError extends SimulationPackageError {
  readonly code = "PROTOCOL_BINDING_MISMATCH";

  // biome-ignore lint/complexity/useMaxParams: public error constructor signature
  constructor(
    message: string,
    context: SimulationErrorContext,
    options?: ErrorOptions,
  ) {
    super(message, { ...options, context });
  }
}

/** The request requires a verification feature this version does not support. */
export class UnsupportedVerificationFeatureError extends SimulationPackageError {
  readonly code = "UNSUPPORTED_VERIFICATION_FEATURE";

  // biome-ignore lint/complexity/useMaxParams: public error constructor signature
  constructor(
    message: string,
    context: SimulationErrorContext,
    options?: ErrorOptions,
  ) {
    super(message, { ...options, context });
  }
}

/** The simulation backend returned a response that cannot be parsed. */
export class InvalidSimulationResponseError extends SimulationPackageError {
  readonly code = "INVALID_SIMULATION_RESPONSE";

  // biome-ignore lint/complexity/useMaxParams: public error constructor signature
  constructor(
    message: string,
    context: SimulationErrorContext,
    options?: ErrorOptions,
  ) {
    super(message, { ...options, context });
  }
}

/** State needed to verify an operation could not be fetched or derived. */
export class MissingVerificationEvidenceError extends SimulationPackageError {
  readonly code = "MISSING_VERIFICATION_EVIDENCE";

  // biome-ignore lint/complexity/useMaxParams: public error constructor signature
  constructor(
    message: string,
    context: SimulationErrorContext,
    options?: ErrorOptions,
  ) {
    super(message, { ...options, context });
  }
}

/** A pending authorization does not match the request it was prepared for. */
export class AuthorizationRequestMismatchError extends SimulationPackageError {
  readonly code = "AUTHORIZATION_REQUEST_MISMATCH";

  // biome-ignore lint/complexity/useMaxParams: public error constructor signature
  constructor(
    message: string,
    context: SimulationErrorContext,
    options?: ErrorOptions,
  ) {
    super(message, { ...options, context });
  }
}

/** An observed asset change violates the expected bounds. */
export class AssetChangeMismatchError extends SimulationPackageError {
  readonly code = "ASSET_CHANGE_MISMATCH";

  // biome-ignore lint/complexity/useMaxParams: public error constructor signature
  constructor(
    message: string,
    context: SimulationErrorContext,
    options?: ErrorOptions,
  ) {
    super(message, { ...options, context });
  }
}

/** An observed permission change (allowance or authorization) violates the expected bounds. */
export class PermissionChangeMismatchError extends SimulationPackageError {
  readonly code = "PERMISSION_CHANGE_MISMATCH";

  // biome-ignore lint/complexity/useMaxParams: public error constructor signature
  constructor(
    message: string,
    context: SimulationErrorContext,
    options?: ErrorOptions,
  ) {
    super(message, { ...options, context });
  }
}

/** An observed state change violates the expected bounds. */
export class StateChangeMismatchError extends SimulationPackageError {
  readonly code = "STATE_CHANGE_MISMATCH";

  // biome-ignore lint/complexity/useMaxParams: public error constructor signature
  constructor(
    message: string,
    context: SimulationErrorContext,
    options?: ErrorOptions,
  ) {
    super(message, { ...options, context });
  }
}

/** An operation left a market outside its allowed constraints. */
export class MarketConstraintViolationError extends SimulationPackageError {
  readonly code = "MARKET_CONSTRAINT_VIOLATION";

  // biome-ignore lint/complexity/useMaxParams: public error constructor signature
  constructor(
    message: string,
    context: SimulationErrorContext,
    options?: ErrorOptions,
  ) {
    super(message, { ...options, context });
  }
}

/** An asset/share conversion exceeded the allowed slippage. */
export class SlippageLimitExceededError extends SimulationPackageError {
  readonly code = "SLIPPAGE_LIMIT_EXCEEDED";

  // biome-ignore lint/complexity/useMaxParams: public error constructor signature
  constructor(
    message: string,
    context: SimulationErrorContext,
    options?: ErrorOptions,
  ) {
    super(message, { ...options, context });
  }
}

/** An observed fee differs from the expected amount. */
export class FeeMismatchError extends SimulationPackageError {
  readonly code = "FEE_MISMATCH";

  // biome-ignore lint/complexity/useMaxParams: public error constructor signature
  constructor(
    message: string,
    context: SimulationErrorContext,
    options?: ErrorOptions,
  ) {
    super(message, { ...options, context });
  }
}

/** A consumer-supplied limit was violated. */
export class ConsumerLimitViolationError extends SimulationPackageError {
  readonly code = "CONSUMER_LIMIT_VIOLATION";

  // biome-ignore lint/complexity/useMaxParams: public error constructor signature
  constructor(
    message: string,
    context: SimulationErrorContext,
    options?: ErrorOptions,
  ) {
    super(message, { ...options, context });
  }
}

/** The simulation failed for a reason that fits no other code. */
export class UnexpectedSimulationError extends SimulationPackageError {
  readonly code = "UNEXPECTED_SIMULATION_ERROR";

  // biome-ignore lint/complexity/useMaxParams: public error constructor signature
  constructor(
    message: string,
    context: SimulationErrorContext,
    options?: ErrorOptions,
  ) {
    super(message, { ...options, context });
  }
}

/**
 * Structural guard for consumers where `instanceof` fails across bundles:
 * true for `SimulationPackageError` instances and for plain objects carrying a
 * `name` string, a known `code`, and an absent or object `context`.
 */
export function isSimulationPackageError(
  value: unknown,
): value is SimulationPackageError {
  if (value instanceof SimulationPackageError) return true;
  if (typeof value !== "object" || value === null) return false;
  const { name, code, context } = value as {
    name?: unknown;
    code?: unknown;
    context?: unknown;
  };
  if (typeof name !== "string") return false;
  if (
    typeof code !== "string" ||
    !(SIMULATION_ERROR_CODES as readonly string[]).includes(code)
  )
    return false;
  return (
    context === undefined || (typeof context === "object" && context !== null)
  );
}
