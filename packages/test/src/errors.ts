/**
 * Error thrown when Anvil exits or fails before its RPC server starts listening.
 *
 * @example
 * ```ts
 * import { AnvilStartupError, spawnAnvil } from "@morpho-org/test";
 *
 * try {
 *   await spawnAnvil({ forkUrl: process.env.MAINNET_RPC_URL });
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
 * Error thrown when an Anvil process or its shared semaphore slot cannot be cleaned up.
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
