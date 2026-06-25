import { MathLib } from "./math.js";

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
export const ORACLE_PRICE_SCALE = MathLib.WAD * MathLib.WAD;
