import { MathLib } from "../../math/index.js";
import type { BigIntish } from "../../types.js";
import type { IVaultV2BluePublicAllocatorConfig } from "./VaultV2BluePublicAllocatorConfig.js";

/** Deterministic helpers for Vault V2 BluePublicAllocator configuration. */
export namespace VaultV2BluePublicAllocatorConfigUtils {
  /**
   * Computes the independently rounded penalty charged for one reallocation.
   *
   * @param config - Configuration or compatible object carrying the WAD-scaled penalty.
   * @param assets - Assets reallocated by the allocator.
   * @returns Penalty assets rounded up exactly as the allocator charges them.
   * @example
   * ```ts
   * import { VaultV2BluePublicAllocatorConfigUtils } from "@morpho-org/blue-sdk";
   *
   * const penaltyAssets = VaultV2BluePublicAllocatorConfigUtils.getPenaltyAssets(
   *   { penalty: 500_000_000_000_000_000n },
   *   3n,
   * );
   * // penaltyAssets === 2n
   * ```
   */
  export function getPenaltyAssets(
    config: Pick<IVaultV2BluePublicAllocatorConfig, "penalty">,
    assets: BigIntish,
  ) {
    return MathLib.wMulUp(assets, config.penalty);
  }
}
