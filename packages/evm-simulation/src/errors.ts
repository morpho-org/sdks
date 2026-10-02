import type { Address, Hash } from "viem";
import type { SimulationOperationSubject } from "./limits.js";
import {
  BLUE_MARKET_OPERATION_TYPES,
  OPERATION_TYPES,
  VAULT_OPERATION_TYPES,
} from "./limits.js";
import type { SimulationMode } from "./params.js";
import { SIMULATION_MODES } from "./params.js";

/** Stable error codes thrown by this package, part of the public API. */
export const SIMULATION_ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNSUPPORTED_CHAIN",
  "EXTERNAL_SERVICE_ERROR",
  "SIMULATION_REVERTED",
  "BLACKLIST_ERROR",
  "UNSUPPORTED_OPERATION",
  "INVALID_SIMULATION_RESPONSE",
  "MISSING_VERIFICATION_EVIDENCE",
  "AUTHORIZATION_REQUEST_MISMATCH",
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

const SIMULATION_STAGES = [
  "validation",
  "preparation",
  "execution",
  "verification",
  "transport",
] as const;

/** Pipeline stage a failure belongs to; `transport` covers RPC and response failures. */
export type SimulationStage = (typeof SIMULATION_STAGES)[number];

interface SimulationContextBase {
  /** Request mode the failure happened in. */
  readonly mode: SimulationMode;
  /** Chain the request targeted. */
  readonly chainId: number;
  /** Block the simulation was pinned to. */
  readonly blockNumber: bigint;
}

interface SimulationCheckContext extends SimulationContextBase {
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

/** Context of a failure while validating the request. */
export type SimulationValidationContext = SimulationContextBase & {
  readonly stage: "validation";
};

/** Context of a failure while reaching the `eth_simulateV1` backend. */
export type SimulationTransportContext = SimulationContextBase & {
  readonly stage: "transport";
};

/** Context of a failure while preparing a preview authorization. */
export type SimulationPreparationContext = SimulationContextBase & {
  readonly stage: "preparation";
  /** Index into `authorizations`. */
  readonly authorizationIndex: number;
  /** Index into that authorization's preparation calls. */
  readonly preparationCallIndex?: number;
};

/** Context of a revert while executing a bundle transaction. */
export type SimulationExecutionContext = SimulationCheckContext &
  SimulationOperationSubject & { readonly stage: "execution" };

/** Context of a verification check that did not hold. */
export type SimulationVerificationContext = SimulationCheckContext &
  SimulationOperationSubject & { readonly stage: "verification" };

/**
 * Where and why a simulation failed, keyed by `stage`
 * (ADR-2026-10-01-evm-simulation-quoted-slippage-limits).
 * Every stage carries `mode`, `chainId` and `blockNumber`. Preparation
 * contexts carry `authorizationIndex` and `preparationCallIndex`. Verification
 * contexts bound to a limit take `operation` and the subject fields
 * (`marketId`, `sourceMarketId`/`targetMarketId`, `vault`,
 * `sourceVault`/`targetVault`, `authorized`) from that `OperationLimit`, not
 * from decoded calldata; unbound ones carry only a `field` string.
 * `"execution"` stays in the union, but `SimulationRevertedError` carries no
 * `context` for caller-transaction or node reverts — the failing
 * `transactionIndex` is reported on the error's `details`. Never contains
 * signatures, RPC URLs, credentials, raw calldata or raw causes (`cause`
 * stays on the error).
 */
export type SimulationErrorContext =
  | SimulationValidationContext
  | SimulationTransportContext
  | SimulationPreparationContext
  | SimulationExecutionContext
  | SimulationVerificationContext
  // Verification checks not bound to one operation name the checked field.
  | (SimulationCheckContext & {
      readonly stage: "verification";
      readonly field: string;
      readonly operation?: never;
    });

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
    this.name = new.target.name;
    if (context !== undefined) {
      this.context = Object.freeze({ ...context });
    }
  }
}

/** Transaction would revert on-chain. Not bypassable. */
export class SimulationRevertedError extends SimulationPackageError {
  override readonly name = "SimulationRevertedError";
  readonly code = "SIMULATION_REVERTED";
  declare readonly context?:
    | SimulationPreparationContext
    | SimulationExecutionContext;

  // biome-ignore lint/complexity/useMaxParams: public error constructor signature
  constructor(
    /** Raw revert string as reported by the backend, when any. */
    public readonly reason: string | undefined,
    public readonly details?: unknown,
    /** Machine-readable cause; `UNKNOWN_REVERT` when the revert maps to no known Morpho condition. */
    public readonly reasonCode: SimulationExecutionReason = "UNKNOWN_REVERT",
    /** Which transaction/authorization reverted and the operation it belonged to. */
    context?: SimulationPreparationContext | SimulationExecutionContext,
  ) {
    super(
      reason ?? "Transaction simulation reverted",
      details instanceof Error ? { cause: details, context } : { context },
    );
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
 * (VaultExitBundlesV1, VaultBundlesV1, BlueBundlesV1 or MidnightBundlesV1) after simulation;
 * pass-through flows and net outflows are allowed. Never bypassable.
 */
export class BlacklistViolationError extends SimulationPackageError {
  override readonly name = "BlacklistViolationError";
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
  override readonly name = "ExternalServiceError";
  readonly code = "EXTERNAL_SERVICE_ERROR";
}

/** Bad input to the simulation functions. Not bypassable. */
export class SimulationValidationError extends SimulationPackageError {
  override readonly name = "SimulationValidationError";
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
  override readonly name = "UnsupportedChainError";
  readonly code = "UNSUPPORTED_CHAIN";

  constructor(
    public readonly chainId: number,
    context?: SimulationErrorContext,
  ) {
    super(`Chain ${chainId} is not configured for simulation`, { context });
  }
}

/**
 * An SDK requirement passed to `toSimulationAuthorizations` cannot be
 * converted into a simulation authorization.
 */
export class UnsupportedOperationError extends SimulationPackageError {
  override readonly name = "UnsupportedOperationError";
  readonly code = "UNSUPPORTED_OPERATION";
}

/** The simulation backend returned a response that cannot be parsed. */
export class InvalidSimulationResponseError extends SimulationPackageError {
  override readonly name = "InvalidSimulationResponseError";
  readonly code = "INVALID_SIMULATION_RESPONSE";
}

/** State needed to verify an operation could not be fetched or derived. */
export class MissingVerificationEvidenceError extends SimulationPackageError {
  override readonly name = "MissingVerificationEvidenceError";
  readonly code = "MISSING_VERIFICATION_EVIDENCE";
}

/** A pending authorization does not match the request it was prepared for. */
export class AuthorizationRequestMismatchError extends SimulationPackageError {
  override readonly name = "AuthorizationRequestMismatchError";
  readonly code = "AUTHORIZATION_REQUEST_MISMATCH";
}

/** A consumer-supplied limit was violated. */
export class ConsumerLimitViolationError extends SimulationPackageError {
  override readonly name = "ConsumerLimitViolationError";
  readonly code = "CONSUMER_LIMIT_VIOLATION";
}

/** The simulation failed for a reason that fits no other code. */
export class UnexpectedSimulationError extends SimulationPackageError {
  override readonly name = "UnexpectedSimulationError";
  readonly code = "UNEXPECTED_SIMULATION_ERROR";
}

const ERROR_NAME_BY_CODE: Readonly<Record<SimulationErrorCode, string>> =
  Object.freeze({
    VALIDATION_ERROR: "SimulationValidationError",
    UNSUPPORTED_CHAIN: "UnsupportedChainError",
    EXTERNAL_SERVICE_ERROR: "ExternalServiceError",
    SIMULATION_REVERTED: "SimulationRevertedError",
    BLACKLIST_ERROR: "BlacklistViolationError",
    UNSUPPORTED_OPERATION: "UnsupportedOperationError",
    INVALID_SIMULATION_RESPONSE: "InvalidSimulationResponseError",
    MISSING_VERIFICATION_EVIDENCE: "MissingVerificationEvidenceError",
    AUTHORIZATION_REQUEST_MISMATCH: "AuthorizationRequestMismatchError",
    CONSUMER_LIMIT_VIOLATION: "ConsumerLimitViolationError",
    UNEXPECTED_SIMULATION_ERROR: "UnexpectedSimulationError",
  });

/**
 * Structural guard for consumers where `instanceof` fails across bundles.
 *
 * @param value - Anything caught.
 * @returns `true` for `SimulationPackageError` instances and for objects
 *   carrying a `message` string, a known `code`, the `name` of the class
 *   owning that `code`, and an absent or
 *   well-formed `context` (known `stage`, `mode`, numeric `chainId`,
 *   `bigint` `blockNumber`, `authorizationIndex` for `preparation`, and a
 *   known `operation` with its subject fields for `execution`/`verification`,
 *   or a verification `field` string with no `operation`).
 * @example
 * ```ts
 * import { isSimulationPackageError, simulate } from "@morpho-org/evm-simulation";
 * import type { Address, Hex } from "viem";
 *
 * declare const user: Address;
 * declare const vault: Address;
 * declare const encodedDeposit: Hex;
 * const config = {
 *   chains: new Map([[1, { simulateV1Url: "https://rpc.example" }]]),
 * };
 * try {
 *   await simulate(config, {
 *     chainId: 1,
 *     transactions: [{ from: user, to: vault, data: encodedDeposit }],
 *   });
 * } catch (e) {
 *   if (!isSimulationPackageError(e)) throw e;
 *   if (e.code !== "SIMULATION_REVERTED") throw e;
 *   console.log(e.context?.stage, e.message);
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
  if (typeof message !== "string") return false;
  if (
    typeof code !== "string" ||
    !(SIMULATION_ERROR_CODES as readonly string[]).includes(code) ||
    name !== ERROR_NAME_BY_CODE[code as SimulationErrorCode]
  )
    return false;
  if (context === undefined) return true;
  if (typeof context !== "object" || context === null || Array.isArray(context))
    return false;
  const { stage, mode, chainId, blockNumber, authorizationIndex } = context as {
    stage?: unknown;
    mode?: unknown;
    chainId?: unknown;
    blockNumber?: unknown;
    authorizationIndex?: unknown;
  };
  if (
    typeof stage !== "string" ||
    !(SIMULATION_STAGES as readonly string[]).includes(stage) ||
    typeof mode !== "string" ||
    !(SIMULATION_MODES as readonly string[]).includes(mode) ||
    typeof chainId !== "number" ||
    typeof blockNumber !== "bigint"
  )
    return false;
  const c = context as Record<string, unknown>;
  if (stage === "preparation") return typeof authorizationIndex === "number";
  if (stage === "verification" && c.operation === undefined)
    return typeof c.field === "string";
  if (stage !== "execution" && stage !== "verification") return true;
  const operation = c.operation;
  if (
    typeof operation !== "string" ||
    !(OPERATION_TYPES as readonly string[]).includes(operation)
  )
    return false;
  const isString = (key: string) => typeof c[key] === "string";
  if (operation === "blueAuthorization") return isString("authorized");
  if (operation === "blueRefinance")
    return isString("sourceMarketId") && isString("targetMarketId");
  if (operation === "vaultV1MigrateToV2")
    return isString("sourceVault") && isString("targetVault");
  if ((BLUE_MARKET_OPERATION_TYPES as readonly string[]).includes(operation))
    return isString("marketId");
  if ((VAULT_OPERATION_TYPES as readonly string[]).includes(operation))
    return isString("vault");
  return false;
}
