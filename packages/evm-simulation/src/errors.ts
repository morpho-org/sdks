import type { MarketId } from "@morpho-org/blue-sdk";
import type {
  metaMorphoAbi,
  morphoMarketV1AdapterAbi,
  morphoMarketV1AdapterV2Abi,
  morphoVaultV1AdapterAbi,
  permit2Abi,
  vaultV2Abi,
} from "@morpho-org/morpho-ts/abis";
import type { Abi, Address, Hex } from "viem";
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

/** Names of the custom errors declared by an ABI. */
type AbiErrorName<abi extends Abi> = Extract<
  abi[number],
  { type: "error" }
>["name"];

/** Morpho Blue `require` revert strings (Morpho Blue `ErrorsLib`). */
export const BLUE_REVERT_REASONS = [
  "not owner",
  "max LLTV exceeded",
  "max fee exceeded",
  "already set",
  "IRM not enabled",
  "LLTV not enabled",
  "market already created",
  "no code",
  "market not created",
  "inconsistent input",
  "zero assets",
  "zero address",
  "unauthorized",
  "insufficient collateral",
  "insufficient liquidity",
  "position is healthy",
  "invalid signature",
  "signature expired",
  "invalid nonce",
  "transfer reverted",
  "transfer returned false",
  "transferFrom reverted",
  "transferFrom returned false",
  "max uint128 exceeded",
] as const;

/** VaultBundlesV1 custom error names (mirrors `vaultBundlesV1Abi` in `@morpho-org/morpho-sdk`). */
export const VAULT_BUNDLES_V1_REVERT_REASONS = [
  "AlreadyInitiated",
  "DeadlinePassed",
  "InconsistentAssets",
  "NotExactlyOneZero",
  "PctExceeded",
  "SlippageExceeded",
] as const;

/** VaultExitBundlesV1 custom error names (mirrors `vaultExitBundlesV1Abi` in `@morpho-org/morpho-sdk`). */
export const VAULT_EXIT_BUNDLES_V1_REVERT_REASONS = [
  "AdapterNotPartOfVault",
  "AlreadyInitiated",
  "ApproveReturnedFalse",
  "DeadlinePassed",
  "InvalidAdaptersLength",
  "MorphoMismatch",
  "NoCode",
  "PctExceeded",
  "SlippageExceeded",
  "TransferReturnedFalse",
  "UnauthorizedCallback",
] as const;

/**
 * Decoded revert of a Morpho contract, keyed by the contract that raised it.
 * `name` is the `require` string for Blue and the custom error name elsewhere;
 * `args` are the decoded custom-error arguments (e.g. the market `id` of
 * `SupplyCapExceeded(bytes32 id)`). Vault V1/V2 names include the OpenZeppelin
 * ERC-20/ERC-4626/ERC-2612 errors those contracts inherit.
 */
export type SimulationRevertReason =
  | {
      readonly contract: "blue";
      readonly name: (typeof BLUE_REVERT_REASONS)[number];
    }
  | {
      readonly contract: "vaultV1";
      readonly name: AbiErrorName<typeof metaMorphoAbi>;
      readonly args?: readonly unknown[];
    }
  | {
      readonly contract: "vaultV2";
      readonly name: AbiErrorName<typeof vaultV2Abi>;
      readonly args?: readonly unknown[];
    }
  | {
      readonly contract: "vaultV2Adapter";
      readonly name: AbiErrorName<
        | typeof morphoVaultV1AdapterAbi
        | typeof morphoMarketV1AdapterAbi
        | typeof morphoMarketV1AdapterV2Abi
      >;
      readonly args?: readonly unknown[];
    }
  | {
      readonly contract: "vaultBundlesV1";
      readonly name: (typeof VAULT_BUNDLES_V1_REVERT_REASONS)[number];
      readonly args?: readonly unknown[];
    }
  | {
      readonly contract: "vaultExitBundlesV1";
      readonly name: (typeof VAULT_EXIT_BUNDLES_V1_REVERT_REASONS)[number];
      readonly args?: readonly unknown[];
    }
  | {
      readonly contract: "permit2";
      readonly name: AbiErrorName<typeof permit2Abi>;
      readonly args?: readonly unknown[];
    }
  /** Revert outside the Morpho catalog (e.g. a token's own ERC-20 error). */
  | {
      readonly contract: "other";
      readonly name?: string;
      readonly args?: readonly unknown[];
      readonly data?: Hex;
    };

/**
 * Where and why a simulation failed. Never contains signatures, RPC URLs,
 * credentials, raw calldata or raw causes (`cause` stays on the error).
 */
export interface SimulationErrorContext {
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
    /** Raw revert string as reported by the backend, when any. */
    public readonly reason: string | undefined,
    public readonly details?: unknown,
    /** Decoded Morpho revert; undefined when the revert data could not be decoded. */
    public readonly revert?: SimulationRevertReason,
    /** Which transaction/authorization reverted and the operation it belonged to. */
    context?: SimulationErrorContext,
  ) {
    super(
      reason ?? "Transaction simulation reverted",
      details instanceof Error ? { cause: details, context } : { context },
    );
  }
}

/** Per-asset net retained amount keyed by restricted contract and token; `netRetained` is a decimal string. */
export interface RetainedAsset {
  readonly address: string | undefined;
  readonly token: string | undefined;
  readonly netRetained: string;
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

/** What `isSimulationPackageError` guarantees: the serializable core of a `SimulationPackageError`. */
export interface SimulationPackageErrorLike {
  readonly name: string;
  readonly message: string;
  readonly code: SimulationErrorCode;
  readonly context?: SimulationErrorContext;
}

/**
 * Structural guard for consumers where `instanceof` fails across bundles or
 * after (de)serialization.
 *
 * @param value - Anything caught or received.
 * @returns `true` for `SimulationPackageError` instances and for objects
 *   carrying `name`/`message` strings, a known `code` and an absent or object
 *   `context`.
 * @example
 * try { await simulate(config, params); } catch (e) {
 *   if (isSimulationPackageError(e) && e.code === "SIMULATION_REVERTED") log(e.context);
 * }
 */
export function isSimulationPackageError(
  value: unknown,
): value is SimulationPackageErrorLike {
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
  return (
    context === undefined || (typeof context === "object" && context !== null)
  );
}
