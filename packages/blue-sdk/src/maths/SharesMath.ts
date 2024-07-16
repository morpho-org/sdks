import { BigIntish } from "../types";

import { MathLib, RoundingDirection } from "./MathLib";

/**
 * JS implementation of {@link https://github.com/morpho-org/morpho-blue/blob/main/src/libraries/SharesMathLib.sol SharesMathLib} used by Morpho Blue
 * & MetaMorpho (via {@link https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/extensions/ERC4626.sol ERC4626}).
 */
export namespace SharesMath {
  export const VIRTUAL_SHARES = 1000000n;
  export const VIRTUAL_ASSETS = 1n;

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
