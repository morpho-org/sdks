import type { Address } from "viem";

/**
 * Error thrown when Anvil exits or fails before its RPC server starts listening.
 *
 * @example
 * ```ts
 * import { AnvilStartupError, spawnAnvil } from "@morpho-org/test";
 *
 * const controller = new AbortController();
 * controller.abort();
 * try {
 *   await spawnAnvil({ chainId: 1 }, { signal: controller.signal });
 * } catch (error) {
 *   if (error instanceof AnvilStartupError) console.error(error.message);
 * }
 * ```
 */
export class AnvilStartupError extends Error {
  /**
   * Creates an Anvil startup error.
   *
   * @param message Actionable description of the startup failure.
   * @param options Standard error options, including the original cause.
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AnvilStartupError";
  }
}

/**
 * Error thrown when a running Anvil process exits unexpectedly or fails during shutdown.
 *
 * @example
 * ```ts
 * import { AnvilProcessError, spawnAnvil } from "@morpho-org/test";
 *
 * const anvil = await spawnAnvil({ chainId: 1 });
 * try {
 *   await anvil.stopAndWait();
 * } catch (error) {
 *   if (error instanceof AnvilProcessError) console.error(error.message);
 * }
 * ```
 */
export class AnvilProcessError extends Error {
  /**
   * Creates an Anvil process error.
   *
   * @param message Actionable description of the unexpected exit.
   * @param options Standard error options, including the original cause.
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AnvilProcessError";
  }
}

/**
 * Error thrown when an Anvil process cannot be cleaned up.
 *
 * @example
 * ```ts
 * import { AnvilCleanupError, spawnAnvil } from "@morpho-org/test";
 *
 * const anvil = await spawnAnvil({ chainId: 1 });
 * try {
 *   await anvil.stopAndWait();
 * } catch (error) {
 *   if (error instanceof AnvilCleanupError) console.error(error.message);
 * }
 * ```
 */
export class AnvilCleanupError extends Error {
  /**
   * Creates an Anvil cleanup error.
   *
   * @param message Actionable description of the cleanup failure.
   * @param options Standard error options, including the original cause.
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AnvilCleanupError";
  }
}

/**
 * Error thrown when writing Tempo's pathUSD fee-token balance does not produce the expected balance.
 *
 * @example
 * ```ts
 * import { AnvilFeeTokenFundingError } from "@morpho-org/test";
 *
 * const reportFixtureFailure = (error: unknown) => {
 *   if (error instanceof AnvilFeeTokenFundingError)
 *     console.error(error.message);
 * };
 * ```
 */
export class AnvilFeeTokenFundingError extends Error {
  /**
   * Creates an Anvil fee-token funding error.
   *
   * @param params Fee token, account, observed and expected balances, and the balances mapping slot.
   * @param options Standard error options, including the original cause.
   */
  constructor(
    params: {
      readonly token: Address;
      readonly account: Address;
      readonly actual: bigint;
      readonly expected: bigint;
      readonly balancesSlot: bigint;
    },
    options?: ErrorOptions,
  ) {
    super(
      `Tempo fee token "${params.token}" balance of "${params.account}" is "${params.actual}" after writing "${params.expected}" to balances slot "${params.balancesSlot}". The TIP-20 storage layout may have changed: find the new balances slot and update TEMPO_FEE_TOKEN_BALANCES_SLOT.`,
      options,
    );
    this.name = "AnvilFeeTokenFundingError";
  }
}

/**
 * Combines an Anvil operation failure with its cleanup failure.
 *
 * @param parameters Operation failure, cleanup failure, actionable message, and optional aggregate summary.
 * @returns An Anvil cleanup error whose cause preserves both failures.
 * @internal
 */
export const createAnvilFailureCleanupError = (parameters: {
  readonly cleanupError: unknown;
  readonly failure: unknown;
  readonly message: string;
  readonly summary?: string;
}) =>
  new AnvilCleanupError(parameters.message, {
    cause: new AggregateError(
      [parameters.failure, parameters.cleanupError],
      parameters.summary ?? "Anvil operation and cleanup both failed.",
    ),
  });
