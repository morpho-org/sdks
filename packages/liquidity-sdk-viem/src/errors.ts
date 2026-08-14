/**
 * Thrown when the Morpho API cannot provide Vault V2 liquidity data.
 *
 * @example
 * ```ts
 * import { VaultV2LiquidityApiError } from "@morpho-org/liquidity-sdk-viem";
 *
 * const error = new VaultV2LiquidityApiError({
 *   url: "https://api.morpho.org/v0/vaults-v2",
 *   status: 503,
 * });
 * console.error(error.status, error.url);
 * ```
 */
export class VaultV2LiquidityApiError extends Error {
  /** HTTP status returned by the Morpho API, when a response was received. */
  public readonly status?: number;

  /** API endpoint that failed. */
  public readonly url: string;

  /**
   * Creates a typed Vault V2 API failure.
   *
   * @param parameters - Endpoint, optional HTTP status, and optional lower-level failure.
   */
  public constructor(parameters: {
    readonly url: string;
    readonly status?: number;
    readonly cause?: unknown;
  }) {
    super(
      parameters.status === undefined
        ? `Morpho API request to "${parameters.url}" failed before receiving an HTTP response. Retry the request or verify network connectivity.`
        : `Morpho API request to "${parameters.url}" failed with HTTP status "${parameters.status}". Retry the request or verify the Vault V2 configuration.`,
      parameters.cause === undefined ? undefined : { cause: parameters.cause },
    );
    this.name = "VaultV2LiquidityApiError";
    this.status = parameters.status;
    this.url = parameters.url;
  }
}

/**
 * Thrown when a successful Morpho API response omits data required for a Vault V2 simulation.
 *
 * @example
 * ```ts
 * import { MissingVaultV2LiquidityApiDataError } from "@morpho-org/liquidity-sdk-viem";
 *
 * const error = new MissingVaultV2LiquidityApiDataError(
 *   "adaptive-curve IRM rateAtTarget",
 * );
 * console.error(error.resource);
 * ```
 */
export class MissingVaultV2LiquidityApiDataError extends Error {
  /** Description of the missing API resource. */
  public readonly resource: string;

  /**
   * Creates a typed missing API data failure.
   *
   * @param resource - Description of the missing API resource.
   */
  public constructor(resource: string) {
    super(
      `Morpho API response omitted required Vault V2 liquidity data for "${resource}". Retry after the API indexer catches up.`,
    );
    this.name = "MissingVaultV2LiquidityApiDataError";
    this.resource = resource;
  }
}

/**
 * Thrown when a successful Morpho API response has an invalid runtime shape.
 *
 * @example
 * ```ts
 * import { InvalidVaultV2LiquidityApiResponseError } from "@morpho-org/liquidity-sdk-viem";
 *
 * const error = new InvalidVaultV2LiquidityApiResponseError(
 *   "https://api.morpho.org/v1/vaults-v2",
 * );
 * console.error(error.url);
 * ```
 */
export class InvalidVaultV2LiquidityApiResponseError extends Error {
  /** API endpoint that returned malformed JSON data. */
  public readonly url: string;

  /**
   * @param url - API endpoint whose successful response failed validation.
   */
  public constructor(url: string) {
    super(
      `Morpho API response from "${url}" is not valid Vault V2 liquidity data. Retry after the API indexer recovers.`,
    );
    this.name = "InvalidVaultV2LiquidityApiResponseError";
    this.url = url;
  }
}

/**
 * Thrown when REST resources required for one liquidity plan were indexed at
 * different blocks.
 *
 * @example
 * ```ts
 * import { InconsistentVaultV2LiquiditySnapshotError } from "@morpho-org/liquidity-sdk-viem";
 *
 * const error = new InconsistentVaultV2LiquiditySnapshotError({
 *   resource: "market state",
 *   expectedBlock: 20_000_000n,
 *   actualBlock: 20_000_001n,
 * });
 * console.error(error.resource, error.expectedBlock, error.actualBlock);
 * ```
 */
export class InconsistentVaultV2LiquiditySnapshotError extends Error {
  /** REST resource whose indexed block differs. */
  public readonly resource: string;
  /** Indexed block selected for the plan. */
  public readonly expectedBlock: bigint;
  /** Indexed block reported by the inconsistent resource. */
  public readonly actualBlock: bigint;

  /**
   * @param parameters - Resource name and conflicting indexed blocks.
   */
  public constructor(parameters: {
    readonly resource: string;
    readonly expectedBlock: bigint;
    readonly actualBlock: bigint;
  }) {
    super(
      `Vault V2 liquidity snapshot requires indexed block "${parameters.expectedBlock}", but "${parameters.resource}" reports "${parameters.actualBlock}". Retry after the API indexer converges.`,
    );
    this.name = "InconsistentVaultV2LiquiditySnapshotError";
    this.resource = parameters.resource;
    this.expectedBlock = parameters.expectedBlock;
    this.actualBlock = parameters.actualBlock;
  }
}
