import { MathLib, RoundingDirection } from "../maths";
import { BigIntish } from "../types";

export namespace VaultUtils {
  export const VIRTUAL_ASSETS = 1n;

  export function decimalsOffset(decimals: BigIntish) {
    return MathLib.zeroFloorSub(18n, decimals);
  }

  export function toAssets(
    shares: BigIntish,
    {
      totalAssets,
      totalSupply,
    }: {
      totalAssets: BigIntish;
      totalSupply: BigIntish;
    },
    { decimalsOffset }: { decimalsOffset: BigIntish },
    rounding: RoundingDirection = "Down",
  ) {
    return MathLib.mulDiv(
      shares,
      BigInt(totalAssets) + VIRTUAL_ASSETS,
      BigInt(totalSupply) + 10n ** BigInt(decimalsOffset),
      rounding,
    );
  }

  export function toShares(
    assets: BigIntish,
    {
      totalAssets,
      totalSupply,
    }: {
      totalAssets: BigIntish;
      totalSupply: BigIntish;
    },
    { decimalsOffset }: { decimalsOffset: BigIntish },
    rounding: RoundingDirection = "Up",
  ) {
    return MathLib.mulDiv(
      assets,
      BigInt(totalSupply) + 10n ** BigInt(decimalsOffset),
      BigInt(totalAssets) + VIRTUAL_ASSETS,
      rounding,
    );
  }
}
