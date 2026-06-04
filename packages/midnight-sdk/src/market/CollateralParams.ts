import type { Address } from "viem";
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
 * Normalized Midnight collateral params.
 *
 * @example
 * ```ts
 * import type { CollateralParams } from "@morpho-org/midnight-sdk";
 *
 * const params: CollateralParams = {
 *   token: "0x0000000000000000000000000000000000000001",
 *   lltv: 770000000000000000n,
 *   maxLif: 1298701298701298701n,
 *   oracle: "0x0000000000000000000000000000000000000002",
 * };
 * console.log(params.lltv);
 * ```
 */
export interface CollateralParams {
  /** Collateral token address. */
  readonly token: Address;
  /** WAD-scaled liquidation loan-to-value. */
  readonly lltv: bigint;
  /** WAD-scaled maximum liquidation incentive factor. */
  readonly maxLif: bigint;
  /** Oracle address for this collateral. */
  readonly oracle: Address;
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
