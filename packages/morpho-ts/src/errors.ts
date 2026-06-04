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

/**
 * Thrown when a bit length cannot represent a uint size.
 *
 * @example
 * ```ts
 * import { InvalidBitLengthError } from "@morpho-org/morpho-ts";
 *
 * throw new InvalidBitLengthError(7);
 * ```
 */
export class InvalidBitLengthError extends Error {
  public constructor(public readonly nBits: number) {
    super(
      `Bit length "${nBits}" is invalid. Use a positive bit length divisible by four.`,
    );
    this.name = "InvalidBitLengthError";
  }
}

/**
 * Thrown when a division receives a zero denominator.
 *
 * @example
 * ```ts
 * import { DivisionByZeroError } from "@morpho-org/morpho-ts";
 *
 * throw new DivisionByZeroError("denominator");
 * ```
 */
export class DivisionByZeroError extends Error {
  public constructor(public readonly field: string) {
    super(`${field} must be non-zero.`);
    this.name = "DivisionByZeroError";
  }
}

/**
 * Thrown when a uint-like value is negative.
 *
 * @example
 * ```ts
 * import { NegativeValueError } from "@morpho-org/morpho-ts";
 *
 * throw new NegativeValueError("assets", -1n);
 * ```
 */
export class NegativeValueError extends Error {
  public constructor(field: string, value: bigint) {
    super(`${field} "${value}" must be non-negative.`);
    this.name = "NegativeValueError";
  }
}
