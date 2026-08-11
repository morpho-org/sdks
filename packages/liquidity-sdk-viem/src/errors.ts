/**
 * Thrown when the Morpho API cannot provide Vault V2 liquidity data.
 *
 * @example
 * ```ts
 * import { VaultV2LiquidityApiError } from "@morpho-org/liquidity-sdk-viem";
 *
 * const error = new VaultV2LiquidityApiError({
 *   url: "https://api.morpho.org/v0/vaults-v2/1:0x1234",
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
 *   "market 0x1234 rateAtTarget",
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
