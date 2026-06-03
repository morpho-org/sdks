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
    super(reason ?? "Transaction simulation reverted");
  }
}

interface RetainedAsset {
  address: string | undefined;
  token: string | undefined;
  netRetained: string;
}

/** Funds would flow to bundler3 contract addresses. Never bypassable. */
export class BlacklistViolationError extends SimulationPackageError {
  readonly code = "BLACKLIST_ERROR";

  constructor(
    message: string,
    public readonly assetChanges?: RetainedAsset[],
  ) {
    super(message);
  }
}

/** Tenderly or RPC service is down. Bypassable — user can proceed. */
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
