/**
 * WAD fixed-point scale, equal to 1e18.
 *
 * @example
 * ```ts
 * import { WAD } from "@morpho-org/morpho-ts";
 *
 * console.log(WAD === 10n ** 18n);
 * ```
 */
export const WAD = 1_000000000000000000n;

/**
 * Oracle price scale, equal to 1e36.
 *
 * @example
 * ```ts
 * import { ORACLE_PRICE_SCALE } from "@morpho-org/morpho-ts";
 *
 * console.log(ORACLE_PRICE_SCALE);
 * ```
 */
export const ORACLE_PRICE_SCALE = 1_000000000000000000000000000000000000n;
