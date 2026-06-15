import type { Address } from "./types.js";

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
 * Thrown when a custom Midnight address registration is missing required entries.
 *
 * @example
 * ```ts
 * import { IncompleteMidnightAddressesError } from "@morpho-org/morpho-ts";
 *
 * throw new IncompleteMidnightAddressesError(8453, ["midnight"]);
 * ```
 */
export class IncompleteMidnightAddressesError extends Error {
  public constructor(chainId: number, missingLabels: readonly string[]) {
    super(
      `Midnight addresses for chain id "${chainId}" are missing "${missingLabels.join('", "')}". Provide a complete deployment entry.`,
    );
    this.name = "IncompleteMidnightAddressesError";
  }
}

/**
 * Thrown when a custom Midnight deployment registration is missing required entries.
 *
 * @example
 * ```ts
 * import { IncompleteMidnightDeploymentsError } from "@morpho-org/morpho-ts";
 *
 * throw new IncompleteMidnightDeploymentsError(8453, ["midnight"]);
 * ```
 */
export class IncompleteMidnightDeploymentsError extends Error {
  public constructor(chainId: number, missingLabels: readonly string[]) {
    super(
      `Midnight deployments for chain id "${chainId}" are missing "${missingLabels.join('", "')}". Provide a complete deployment entry.`,
    );
    this.name = "IncompleteMidnightDeploymentsError";
  }
}

/**
 * Thrown when a custom Midnight address registration attempts to change an existing value.
 *
 * @example
 * ```ts
 * import { MidnightAddressAlreadyRegisteredError } from "@morpho-org/morpho-ts";
 *
 * throw new MidnightAddressAlreadyRegisteredError({
 *   chainId: 8453,
 *   label: "midnight",
 *   registeredAddress: "0x0000000000000000000000000000000000000001",
 *   requestedAddress: "0x0000000000000000000000000000000000000002",
 * });
 * ```
 */
export class MidnightAddressAlreadyRegisteredError extends Error {
  public constructor({
    chainId,
    label,
    registeredAddress,
    requestedAddress,
  }: {
    chainId: number;
    label: string;
    registeredAddress: Address;
    requestedAddress: Address;
  }) {
    super(
      `Midnight address "${chainId}.${label}" is already registered as "${registeredAddress}", got "${requestedAddress}". Use the registered address or choose an unregistered chain id.`,
    );
    this.name = "MidnightAddressAlreadyRegisteredError";
  }
}

/**
 * Thrown when a custom Midnight deployment registration attempts to change an existing value.
 *
 * @example
 * ```ts
 * import { MidnightDeploymentAlreadyRegisteredError } from "@morpho-org/morpho-ts";
 *
 * throw new MidnightDeploymentAlreadyRegisteredError({
 *   chainId: 8453,
 *   label: "midnight",
 *   registeredDeployment: 1n,
 *   requestedDeployment: 2n,
 * });
 * ```
 */
export class MidnightDeploymentAlreadyRegisteredError extends Error {
  public constructor({
    chainId,
    label,
    registeredDeployment,
    requestedDeployment,
  }: {
    chainId: number;
    label: string;
    registeredDeployment: bigint;
    requestedDeployment: bigint;
  }) {
    super(
      `Midnight deployment "${chainId}.${label}" is already registered as "${registeredDeployment}", got "${requestedDeployment}". Use the registered deployment or choose an unregistered chain id.`,
    );
    this.name = "MidnightDeploymentAlreadyRegisteredError";
  }
}
