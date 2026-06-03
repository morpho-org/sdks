import type { Address } from "viem";

import { deepFreeze, normalizeAddress, toBigInt } from "../internal.js";
import type { BigIntish } from "../types.js";

/**
 * Plain input accepted by {@link CollateralParams}.
 *
 * @example
 * ```ts
 * import type { ICollateralParams } from "@morpho-org/midnight-sdk";
 *
 * const params: ICollateralParams = {
 *   token: "0x0000000000000000000000000000000000000001",
 *   lltv: 770000000000000000n,
 *   maxLif: 1298701298701298701n,
 *   oracle: "0x0000000000000000000000000000000000000002",
 * };
 * ```
 */
export interface ICollateralParams {
  /** Collateral token address. */
  readonly token: Address | string;
  /** WAD-scaled liquidation loan-to-value. */
  readonly lltv: BigIntish;
  /** WAD-scaled maximum liquidation incentive factor. */
  readonly maxLif: BigIntish;
  /** Oracle address for this collateral. */
  readonly oracle: Address | string;
}

/**
 * ABI-compatible Midnight collateral params.
 *
 * @example
 * ```ts
 * import { CollateralParams } from "@morpho-org/midnight-sdk";
 *
 * const params = new CollateralParams({
 *   token: "0x0000000000000000000000000000000000000001",
 *   lltv: 770000000000000000n,
 *   maxLif: 1298701298701298701n,
 *   oracle: "0x0000000000000000000000000000000000000002",
 * });
 * console.log(params.toStruct().lltv);
 * ```
 */
export class CollateralParams {
  /** Collateral token address. */
  public readonly token: Address;

  /** WAD-scaled liquidation loan-to-value. */
  public readonly lltv: bigint;

  /** WAD-scaled maximum liquidation incentive factor. */
  public readonly maxLif: bigint;

  /** Oracle address for this collateral. */
  public readonly oracle: Address;

  public constructor(params: ICollateralParams) {
    this.token = normalizeAddress(params.token);
    this.lltv = toBigInt(params.lltv, "lltv");
    this.maxLif = toBigInt(params.maxLif, "maxLif");
    this.oracle = normalizeAddress(params.oracle);
    deepFreeze(this);
  }

  /**
   * Converts the class into the tuple object expected by viem ABI encoders.
   *
   * @returns ABI-compatible collateral params.
   * @example
   * ```ts
   * import { CollateralParams } from "@morpho-org/midnight-sdk";
   *
   * const tuple = new CollateralParams({
   *   token: "0x0000000000000000000000000000000000000001",
   *   lltv: 770000000000000000n,
   *   maxLif: 1298701298701298701n,
   *   oracle: "0x0000000000000000000000000000000000000002",
   * }).toStruct();
   * console.log(tuple.token);
   * ```
   */
  public toStruct(): CollateralParamsStruct {
    return {
      token: this.token,
      lltv: this.lltv,
      maxLif: this.maxLif,
      oracle: this.oracle,
    };
  }
}

/**
 * ABI tuple shape for `CollateralParams`.
 *
 * @example
 * ```ts
 * import type { CollateralParamsStruct } from "@morpho-org/midnight-sdk";
 *
 * const params: CollateralParamsStruct = {
 *   token: "0x0000000000000000000000000000000000000001",
 *   lltv: 1n,
 *   maxLif: 1n,
 *   oracle: "0x0000000000000000000000000000000000000002",
 * };
 * ```
 */
export interface CollateralParamsStruct {
  /** Collateral token address. */
  readonly token: Address;
  /** WAD-scaled liquidation loan-to-value. */
  readonly lltv: bigint;
  /** WAD-scaled maximum liquidation incentive factor. */
  readonly maxLif: bigint;
  /** Oracle address. */
  readonly oracle: Address;
}

/**
 * Normalizes collateral params into an immutable class.
 *
 * @param params - Plain or class collateral params.
 * @returns Normalized collateral params.
 * @example
 * ```ts
 * import { normalizeCollateralParams } from "@morpho-org/midnight-sdk";
 *
 * const params = normalizeCollateralParams({
 *   token: "0x0000000000000000000000000000000000000001",
 *   lltv: 1n,
 *   maxLif: 1n,
 *   oracle: "0x0000000000000000000000000000000000000002",
 * });
 * console.log(params.token);
 * ```
 */
export function normalizeCollateralParams(
  params: ICollateralParams | CollateralParams,
) {
  return params instanceof CollateralParams
    ? params
    : new CollateralParams(params);
}
