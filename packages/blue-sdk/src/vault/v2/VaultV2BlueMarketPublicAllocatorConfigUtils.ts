import { MathLib } from "../../math/index.js";
import type { BigIntish } from "../../types.js";
import type { IVaultV2BlueMarketPublicAllocatorConfig } from "./VaultV2BlueMarketPublicAllocatorConfig.js";

/** Deterministic helpers for Vault V2 adapter-market BluePublicAllocator configuration. */
export namespace VaultV2BlueMarketPublicAllocatorConfigUtils {
  /**
   * Computes the assets that may still be allocated under the allocator cap.
   *
   * @param config - Configuration or compatible object carrying the absolute cap.
   * @param allocation - Effective current allocation, including untracked assets.
   * @returns Remaining allocator capacity, floored at zero.
   * @example
   * ```ts
   * import { VaultV2BlueMarketPublicAllocatorConfigUtils } from "@morpho-org/blue-sdk";
   *
   * const maxIn = VaultV2BlueMarketPublicAllocatorConfigUtils.getMaxIn(
   *   { absoluteCap: 100n },
   *   40n,
   * );
   * // maxIn === 60n
   * ```
   */
  export function getMaxIn(
    config: Pick<IVaultV2BlueMarketPublicAllocatorConfig, "absoluteCap">,
    allocation: BigIntish,
  ) {
    return MathLib.zeroFloorSub(config.absoluteCap, allocation);
  }
}
