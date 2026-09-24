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

/** Calldata routed to an operation the verifier does not support. Not bypassable. */
export class UnsupportedOperationError extends SimulationPackageError {
  readonly code = "UNSUPPORTED_OPERATION";

  // biome-ignore lint/complexity/useMaxParams: public error API requires the (message, context, options) signature
  constructor(
    message: string,
    public readonly context: SimulationErrorContext,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** A decoded effect is bound to the wrong chain, deployment, or subject. Not bypassable. */
export class ProtocolBindingMismatchError extends SimulationPackageError {
  readonly code = "PROTOCOL_BINDING_MISMATCH";

  // biome-ignore lint/complexity/useMaxParams: public error API requires the (message, context, options) signature
  constructor(
    message: string,
    public readonly context: SimulationErrorContext,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** The caller requested a verification feature this release does not implement. Not bypassable. */
export class UnsupportedVerificationFeatureError extends SimulationPackageError {
  readonly code = "UNSUPPORTED_VERIFICATION_FEATURE";

  // biome-ignore lint/complexity/useMaxParams: public error API requires the (message, context, options) signature
  constructor(
    message: string,
    public readonly context: SimulationErrorContext,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** The simulation node returned a response that cannot be trusted. Not bypassable. */
export class InvalidSimulationResponseError extends SimulationPackageError {
  readonly code = "INVALID_SIMULATION_RESPONSE";

  // biome-ignore lint/complexity/useMaxParams: public error API requires the (message, context, options) signature
  constructor(
    message: string,
    public readonly context: SimulationErrorContext,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** Required verification evidence could not be collected. Not bypassable. */
export class MissingVerificationEvidenceError extends SimulationPackageError {
  readonly code = "MISSING_VERIFICATION_EVIDENCE";

  // biome-ignore lint/complexity/useMaxParams: public error API requires the (message, context, options) signature
  constructor(
    message: string,
    public readonly context: SimulationErrorContext,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** An authorization does not match the pending wallet request it claims to satisfy. Not bypassable. */
export class AuthorizationRequestMismatchError extends SimulationPackageError {
  readonly code = "AUTHORIZATION_REQUEST_MISMATCH";

  // biome-ignore lint/complexity/useMaxParams: public error API requires the (message, context, options) signature
  constructor(
    message: string,
    public readonly context: SimulationErrorContext,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** Observed wallet asset changes differ from the verified expectation. Not bypassable. */
export class AssetChangeMismatchError extends SimulationPackageError {
  readonly code = "ASSET_CHANGE_MISMATCH";

  // biome-ignore lint/complexity/useMaxParams: public error API requires the (message, context, options) signature
  constructor(
    message: string,
    public readonly context: SimulationErrorContext,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** Observed permission changes differ from the verified expectation. Not bypassable. */
export class PermissionChangeMismatchError extends SimulationPackageError {
  readonly code = "PERMISSION_CHANGE_MISMATCH";

  // biome-ignore lint/complexity/useMaxParams: public error API requires the (message, context, options) signature
  constructor(
    message: string,
    public readonly context: SimulationErrorContext,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** Observed position, market, or vault state changes differ from the verified expectation. Not bypassable. */
export class StateChangeMismatchError extends SimulationPackageError {
  readonly code = "STATE_CHANGE_MISMATCH";

  // biome-ignore lint/complexity/useMaxParams: public error API requires the (message, context, options) signature
  constructor(
    message: string,
    public readonly context: SimulationErrorContext,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** Execution would violate a protocol market constraint. Not bypassable. */
export class MarketConstraintViolationError extends SimulationPackageError {
  readonly code = "MARKET_CONSTRAINT_VIOLATION";

  // biome-ignore lint/complexity/useMaxParams: public error API requires the (message, context, options) signature
  constructor(
    message: string,
    public readonly context: SimulationErrorContext,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** Execution would exceed the caller's slippage bound. Not bypassable. */
export class SlippageLimitExceededError extends SimulationPackageError {
  readonly code = "SLIPPAGE_LIMIT_EXCEEDED";

  // biome-ignore lint/complexity/useMaxParams: public error API requires the (message, context, options) signature
  constructor(
    message: string,
    public readonly context: SimulationErrorContext,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** An observed fee differs from its expected recipient, rate, or amount. Not bypassable. */
export class FeeMismatchError extends SimulationPackageError {
  readonly code = "FEE_MISMATCH";

  // biome-ignore lint/complexity/useMaxParams: public error API requires the (message, context, options) signature
  constructor(
    message: string,
    public readonly context: SimulationErrorContext,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** Verified effects violate a caller-supplied limit. Carries the bound constraint. Not bypassable. */
export class ConsumerLimitViolationError extends SimulationPackageError {
  readonly code = "CONSUMER_LIMIT_VIOLATION";

  // biome-ignore lint/complexity/useMaxParams: public error API requires the (message, context, options) signature
  constructor(
    message: string,
    public readonly context: SimulationErrorContext,
    public readonly constraint: ConsumerConstraintContext,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** A failure the simulator cannot classify more precisely. Not bypassable. */
export class UnexpectedSimulationError extends SimulationPackageError {
  readonly code = "UNEXPECTED_SIMULATION_ERROR";

  // biome-ignore lint/complexity/useMaxParams: public error API requires the (message, context, options) signature
  constructor(
    message: string,
    public readonly context: SimulationErrorContext,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
