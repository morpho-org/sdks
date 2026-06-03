import type { BigIntish } from "../types.js";

import { MathLib, type RoundingDirection } from "./MathLib.js";

/**
 * JS implementation of {@link https://github.com/morpho-org/morpho-blue/blob/main/src/libraries/SharesMathLib.sol SharesMathLib} used by Morpho Blue
 * & MetaMorpho (via {@link https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/extensions/ERC4626.sol ERC4626}).
 */
export namespace SharesMath {
  /** Virtual shares added to Morpho Blue and ERC-4626 share conversions. */
  export const VIRTUAL_SHARES = 1000000n;
  /** Virtual assets added to Morpho Blue and ERC-4626 asset conversions. */
  export const VIRTUAL_ASSETS = 1n;

  /**
   * Converts shares to assets using Morpho virtual shares and assets.
   *
   * @param shares - The amount of shares.
   * @param totalAssets - The total assets before conversion.
   * @param totalShares - The total shares before conversion.
   * @param rounding - The rounding direction.
   * @returns The equivalent amount of assets.
   * @example
   * ```ts
   * import { SharesMath } from "@morpho-org/blue-sdk";
   *
   * const assets = SharesMath.toAssets(100n, 1_000n, 100n, "Down");
   * // assets satisfies bigint
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function toAssets(
    shares: BigIntish,
    totalAssets: BigIntish,
    totalShares: BigIntish,
    rounding: RoundingDirection,
  ) {
    return MathLib.mulDiv(
      shares,
      BigInt(totalAssets) + VIRTUAL_ASSETS,
      BigInt(totalShares) + VIRTUAL_SHARES,
      rounding,
    );
  }

  /**
   * Converts assets to shares using Morpho virtual shares and assets.
   *
   * @param assets - The amount of assets.
   * @param totalAssets - The total assets before conversion.
   * @param totalShares - The total shares before conversion.
   * @param rounding - The rounding direction.
   * @returns The equivalent amount of shares.
   * @example
   * ```ts
   * import { SharesMath } from "@morpho-org/blue-sdk";
   *
   * const shares = SharesMath.toShares(100n, 1_000n, 100n, "Up");
   * // shares satisfies bigint
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function toShares(
    assets: BigIntish,
    totalAssets: BigIntish,
    totalShares: BigIntish,
    rounding: RoundingDirection,
  ) {
    return MathLib.mulDiv(
      assets,
      BigInt(totalShares) + VIRTUAL_SHARES,
      BigInt(totalAssets) + VIRTUAL_ASSETS,
      rounding,
    );
  }
}
