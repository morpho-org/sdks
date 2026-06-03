import type { BigIntish } from "./types.js";

/**
 * Returns `x - y`, floored to zero when `y` is greater than or equal to `x`.
 *
 * @param x - Minuend accepted by `BigInt`.
 * @param y - Subtrahend accepted by `BigInt`.
 * @returns The non-negative difference.
 * @throws When `BigInt` cannot convert an input.
 * @example
 * ```ts
 * import { zeroFloorSub } from "@morpho-org/morpho-ts";
 *
 * console.log(zeroFloorSub(10n, 3n));
 * ```
 */
export const zeroFloorSub = (x: BigIntish, y: BigIntish) => {
  const normalizedX = BigInt(x);
  const normalizedY = BigInt(y);

  return normalizedX <= normalizedY ? 0n : normalizedX - normalizedY;
};

/**
 * Multiplies two values and divides by a denominator, rounding down.
 *
 * @param x - First factor accepted by `BigInt`.
 * @param y - Second factor accepted by `BigInt`.
 * @param denominator - Divisor accepted by `BigInt`.
 * @returns The floored product quotient.
 * @throws When `BigInt` cannot convert an input or denominator is zero.
 * @example
 * ```ts
 * import { mulDivDown } from "@morpho-org/morpho-ts";
 *
 * console.log(mulDivDown(7n, 3n, 2n));
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: Mirrors Solidity mulDiv helper shape.
export const mulDivDown = (
  x: BigIntish,
  y: BigIntish,
  denominator: BigIntish,
) => {
  const normalizedX = BigInt(x);
  const normalizedY = BigInt(y);
  const normalizedDenominator = BigInt(denominator);
  if (normalizedDenominator === 0n) throw Error("MathLib: DIVISION_BY_ZERO");

  return (normalizedX * normalizedY) / normalizedDenominator;
};

/**
 * Multiplies two values and divides by a denominator, rounding up.
 *
 * @param x - First factor accepted by `BigInt`.
 * @param y - Second factor accepted by `BigInt`.
 * @param denominator - Divisor accepted by `BigInt`.
 * @returns The ceiled product quotient.
 * @throws When `BigInt` cannot convert an input or denominator is zero.
 * @example
 * ```ts
 * import { mulDivUp } from "@morpho-org/morpho-ts";
 *
 * console.log(mulDivUp(7n, 3n, 2n));
 * ```
 */
// biome-ignore lint/complexity/useMaxParams: Mirrors Solidity mulDiv helper shape.
export const mulDivUp = (
  x: BigIntish,
  y: BigIntish,
  denominator: BigIntish,
) => {
  const normalizedX = BigInt(x);
  const normalizedY = BigInt(y);
  const normalizedDenominator = BigInt(denominator);
  if (normalizedDenominator === 0n) throw Error("MathLib: DIVISION_BY_ZERO");

  const product = normalizedX * normalizedY;

  return (
    product / normalizedDenominator +
    (product % normalizedDenominator === 0n ? 0n : 1n)
  );
};
