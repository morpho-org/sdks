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
