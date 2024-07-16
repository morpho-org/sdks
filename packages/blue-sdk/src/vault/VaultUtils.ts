import { MathLib, RoundingDirection } from "../maths";

export namespace VaultUtils {
  export const VIRTUAL_ASSETS = 1n;

  export function toAssets(
    shares: bigint,
    {
      totalAssets,
      totalSupply,
    }: {
      totalAssets: bigint;
      totalSupply: bigint;
    },
    { decimalsOffset }: { decimalsOffset: bigint },
    rounding: RoundingDirection = "Down"
  ) {
    return MathLib.mulDiv(shares, totalAssets + VIRTUAL_ASSETS, totalSupply + 10n ** decimalsOffset, rounding);
  }

  export function toShares(
    assets: bigint,
    {
      totalAssets,
      totalSupply,
    }: {
      totalAssets: bigint;
      totalSupply: bigint;
    },
    { decimalsOffset }: { decimalsOffset: bigint },
    rounding: RoundingDirection = "Up"
  ) {
    return MathLib.mulDiv(assets, totalSupply + 10n ** decimalsOffset, totalAssets + VIRTUAL_ASSETS, rounding);
  }
}
