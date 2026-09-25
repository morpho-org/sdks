import type {
  ConsumerConstraintContext,
  SimulationErrorContext,
} from "./domain/diagnostics.js";

/**
 * Base class for every error this package throws. Transport-agnostic — no HTTP status codes.
 * Consumers pattern-match with `instanceof` on the concrete subclass.
 */
export abstract class SimulationPackageError extends Error {
  /** Stable string discriminator for log aggregation and external mapping. */
  abstract readonly code: string;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = this.constructor.name;
  }
}

/** Transaction would revert on-chain. Not bypassable. */
export class SimulationRevertedError extends SimulationPackageError {
  readonly code = "SIMULATION_REVERTED";

  constructor(
    public readonly reason: string | undefined,
    public readonly details?: unknown,
  ) {
    super(
      reason ?? "Transaction simulation reverted",
      details instanceof Error ? { cause: details } : undefined,
    );
  }
}

interface RetainedAsset {
  address: string | undefined;
  token: string | undefined;
  netRetained: string;
}

/**
 * Thrown when net value above the dust threshold is retained by a restricted bundles contract
 * (VaultExitBundlesV1, VaultBundlesV1, BlueBundlesV1 or MidnightBundlesV1) after simulation;
 * pass-through flows and net outflows are allowed. Never bypassable.
 */
export class BlacklistViolationError extends SimulationPackageError {
  readonly code = "BLACKLIST_ERROR";

  constructor(
    message: string,
    /** Per-asset net retained amounts keyed by restricted contract and token. */
    public readonly assetChanges?: RetainedAsset[],
  ) {
    super(message);
  }
}

/** RPC service is down or unreachable. Bypassable — user can proceed. */
export class ExternalServiceError extends SimulationPackageError {
  readonly code = "EXTERNAL_SERVICE_ERROR";
}

/** Bad input to the simulation functions. Not bypassable. */
export class SimulationValidationError extends SimulationPackageError {
  readonly code = "VALIDATION_ERROR";

  constructor(
    message: string,
    public readonly fieldErrors?: string[],
  ) {
    super(message);
  }
}

/** Chain ID not configured for any simulation method. Not bypassable. */
export class UnsupportedChainError extends SimulationPackageError {
  readonly code = "UNSUPPORTED_CHAIN";

  constructor(public readonly chainId: number) {
    super(`Chain ${chainId} is not configured for simulation`);
  }
}

/**
 * Shared constructor for errors carrying a {@link SimulationErrorContext}.
 * @internal
 */
abstract class SimulationContextError extends SimulationPackageError {
  // biome-ignore lint/complexity/useMaxParams: public error API requires the (message, context, options) signature
  constructor(
    message: string,
    public readonly context: SimulationErrorContext,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** Calldata routed to an operation the verifier does not support. Not bypassable. */
export class UnsupportedOperationError extends SimulationContextError {
  readonly code = "UNSUPPORTED_OPERATION";
}

/** A decoded effect is bound to the wrong chain, deployment, or subject. Not bypassable. */
export class ProtocolBindingMismatchError extends SimulationContextError {
  readonly code = "PROTOCOL_BINDING_MISMATCH";
}

/** The caller requested a verification feature this release does not implement. Not bypassable. */
export class UnsupportedVerificationFeatureError extends SimulationContextError {
  readonly code = "UNSUPPORTED_VERIFICATION_FEATURE";
}

/** The simulation node returned a response that cannot be trusted. Not bypassable. */
export class InvalidSimulationResponseError extends SimulationContextError {
  readonly code = "INVALID_SIMULATION_RESPONSE";
}

/** Required verification evidence could not be collected. Not bypassable. */
export class MissingVerificationEvidenceError extends SimulationContextError {
  readonly code = "MISSING_VERIFICATION_EVIDENCE";
}

/** An authorization does not match the pending wallet request it claims to satisfy. Not bypassable. */
export class AuthorizationRequestMismatchError extends SimulationContextError {
  readonly code = "AUTHORIZATION_REQUEST_MISMATCH";
}

/** Observed wallet asset changes differ from the verified expectation. Not bypassable. */
export class AssetChangeMismatchError extends SimulationContextError {
  readonly code = "ASSET_CHANGE_MISMATCH";
}

/** Observed permission changes differ from the verified expectation. Not bypassable. */
export class PermissionChangeMismatchError extends SimulationContextError {
  readonly code = "PERMISSION_CHANGE_MISMATCH";
}

/** Observed position, market, or vault state changes differ from the verified expectation. Not bypassable. */
export class StateChangeMismatchError extends SimulationContextError {
  readonly code = "STATE_CHANGE_MISMATCH";
}

/** Execution would violate a protocol market constraint. Not bypassable. */
export class MarketConstraintViolationError extends SimulationContextError {
  readonly code = "MARKET_CONSTRAINT_VIOLATION";
}

/** Execution would exceed the caller's slippage bound. Not bypassable. */
export class SlippageLimitExceededError extends SimulationContextError {
  readonly code = "SLIPPAGE_LIMIT_EXCEEDED";
}

/** An observed fee differs from its expected recipient, rate, or amount. Not bypassable. */
export class FeeMismatchError extends SimulationContextError {
  readonly code = "FEE_MISMATCH";
}

/** Verified effects violate a caller-supplied limit. Carries the bound constraint. Not bypassable. */
export class ConsumerLimitViolationError extends SimulationContextError {
  readonly code = "CONSUMER_LIMIT_VIOLATION";

  // biome-ignore lint/complexity/useMaxParams: public error API requires the (message, context, constraint, options) signature
  constructor(
    message: string,
    context: SimulationErrorContext,
    public readonly constraint: ConsumerConstraintContext,
    options?: ErrorOptions,
  ) {
    super(message, context, options);
  }
}

/** A failure the simulator cannot classify more precisely. Not bypassable. */
export class UnexpectedSimulationError extends SimulationContextError {
  readonly code = "UNEXPECTED_SIMULATION_ERROR";
}
