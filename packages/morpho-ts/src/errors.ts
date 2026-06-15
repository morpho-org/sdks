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

/**
 * Thrown when registry registration attempts to replace an existing primitive value.
 *
 * @example
 * ```ts
 * import { RegistryValueAlreadyRegisteredError } from "@morpho-org/morpho-ts";
 *
 * throw new RegistryValueAlreadyRegisteredError({
 *   label: "1.blue.morpho",
 *   registeredValue: "0x0000000000000000000000000000000000000001",
 *   requestedValue: "0x0000000000000000000000000000000000000002",
 *   type: "address",
 * });
 * ```
 */
export class RegistryValueAlreadyRegisteredError extends Error {
  public constructor({
    label,
    registeredValue,
    requestedValue,
    type,
  }: {
    label: string;
    registeredValue: string | bigint | number | boolean;
    requestedValue: string | bigint | number | boolean;
    type: string;
  }) {
    super(
      `Registry ${type} "${label}" is already registered as "${registeredValue}", got "${requestedValue}". Use the registered value or choose an unregistered chain id.`,
    );
    this.name = "RegistryValueAlreadyRegisteredError";
  }
}

/**
 * Thrown when a custom registry entry does not include the minimum fields required by SDK consumers.
 *
 * @example
 * ```ts
 * import { IncompleteChainRegistryError } from "@morpho-org/morpho-ts";
 *
 * throw new IncompleteChainRegistryError({
 *   chainId: 31337,
 *   type: "address",
 * });
 * ```
 */
export class IncompleteChainRegistryError extends Error {
  public readonly chainId: number;
  public readonly type: string;

  public constructor({
    chainId,
    type,
  }: {
    chainId: number;
    type: string;
  }) {
    super(
      `Registry ${type} for chain id "${chainId}" is missing required entries. Register morpho/blue, Bundler3 executor and general adapter, and AdaptiveCurveIrm, or use a supported chain.`,
    );
    this.chainId = chainId;
    this.type = type;
    this.name = "IncompleteChainRegistryError";
  }
}

/**
 * Thrown when a supported chain has no address registered for a requested label.
 *
 * @example
 * ```ts
 * import { UnknownAddressError } from "@morpho-org/morpho-ts";
 *
 * throw new UnknownAddressError({ chainId: 1, label: "midnight" });
 * ```
 */
export class UnknownAddressError extends Error {
  public readonly chainId: number;
  public readonly label: string;

  public constructor({
    chainId,
    label,
  }: {
    chainId: number;
    label: string;
  }) {
    super(
      `Address "${label}" is not registered for chain id "${chainId}". Register the address or use a supported chain.`,
    );
    this.chainId = chainId;
    this.label = label;
    this.name = "UnknownAddressError";
  }
}
