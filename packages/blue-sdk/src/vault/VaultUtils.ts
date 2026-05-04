import { MathLib, type RoundingDirection } from "../math/index.js";
import type { BigIntish } from "../types.js";

export namespace VaultUtils {
  export const VIRTUAL_ASSETS = 1n;

  export function decimalsOffset(decimals: BigIntish) {
    return MathLib.zeroFloorSub(18n, decimals);
  }

  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function toAssets(
    shares: BigIntish,
    {
      totalAssets,
      totalSupply,
      // biome-ignore lint/nursery/noShadow: TODO rename to avoid shadowing
      decimalsOffset,
    }: {
      totalAssets: BigIntish;
      totalSupply: BigIntish;
      decimalsOffset: BigIntish;
    },
    rounding: RoundingDirection = "Down",
  ) {
    return MathLib.mulDiv(
      shares,
      BigInt(totalAssets) + VIRTUAL_ASSETS,
      BigInt(totalSupply) + 10n ** BigInt(decimalsOffset),
      rounding,
    );
  }

  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function toShares(
    assets: BigIntish,
    {
      totalAssets,
      totalSupply,
      // biome-ignore lint/nursery/noShadow: TODO rename to avoid shadowing
      decimalsOffset,
    }: {
      totalAssets: BigIntish;
      totalSupply: BigIntish;
      decimalsOffset: BigIntish;
    },
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
