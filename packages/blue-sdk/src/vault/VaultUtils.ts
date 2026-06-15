import { MathLib, type RoundingDirection } from "../math/index.js";
import type { BigIntish } from "../types.js";

/** ERC-4626 virtual share and asset conversion helpers for MetaMorpho vaults. */
export namespace VaultUtils {
  /** Virtual assets added to ERC-4626 total assets in conversion formulas. */
  export const VIRTUAL_ASSETS = 1n;

  /**
   * Returns the decimals offset between 18-decimal vault shares and an asset.
   *
   * @param decimals - The asset decimals.
   * @returns The non-negative decimals offset.
   * @example
   * ```ts
   * import { VaultUtils } from "@morpho-org/blue-sdk";
   *
   * const offset = VaultUtils.decimalsOffset(6n);
   * // offset === 12n
   * ```
   */
  export function decimalsOffset(decimals: BigIntish) {
    return MathLib.zeroFloorSub(18n, decimals);
  }

  /**
   * Converts vault shares to underlying assets.
   *
   * @param shares - The amount of vault shares.
   * @param vault.totalAssets - The vault's total assets.
   * @param vault.totalSupply - The vault's total share supply.
   * @param vault.decimalsOffset - The vault's decimals offset.
   * @param rounding - Optional rounding direction. Defaults to `"Down"`.
   * @returns The equivalent amount of underlying assets.
   * @example
   * ```ts
   * import { VaultUtils } from "@morpho-org/blue-sdk";
   *
   * const assets = VaultUtils.toAssets(100n, { totalAssets: 1_000n, totalSupply: 100n, decimalsOffset: 0n });
   * // assets satisfies bigint
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function toAssets(
    shares: BigIntish,
    {
      totalAssets,
      totalSupply,
      // biome-ignore lint/suspicious/noShadow: TODO rename to avoid shadowing
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

  /**
   * Converts underlying assets to vault shares.
   *
   * @param assets - The amount of underlying assets.
   * @param vault.totalAssets - The vault's total assets.
   * @param vault.totalSupply - The vault's total share supply.
   * @param vault.decimalsOffset - The vault's decimals offset.
   * @param rounding - Optional rounding direction. Defaults to `"Up"`.
   * @returns The equivalent amount of vault shares.
   * @example
   * ```ts
   * import { VaultUtils } from "@morpho-org/blue-sdk";
   *
   * const shares = VaultUtils.toShares(100n, { totalAssets: 1_000n, totalSupply: 100n, decimalsOffset: 0n });
   * // shares satisfies bigint
   * ```
   */
  // biome-ignore lint/complexity/useMaxParams: TODO refactor to ≤2 params
  export function toShares(
    assets: BigIntish,
    {
      totalAssets,
      totalSupply,
      // biome-ignore lint/suspicious/noShadow: TODO rename to avoid shadowing
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
