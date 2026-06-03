/**
 * Thrown when a chain id is not supported by a package helper.
 *
 * @example
 * ```ts
 * import { UnsupportedChainIdError } from "@morpho-org/morpho-ts";
 *
 * throw new UnsupportedChainIdError(999);
 * ```
 */
export class UnsupportedChainIdError extends Error {
  public readonly code = "UNSUPPORTED_CHAIN";

  public constructor(public readonly chainId: number) {
    super(`Chain id "${chainId}" is not supported.`);
    this.name = "UnsupportedChainIdError";
  }
}
