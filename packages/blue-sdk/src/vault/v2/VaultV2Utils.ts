import { MathLib } from "../../math/index.js";
import type { BigIntish } from "../../types.js";
import { type CapacityLimit, CapacityLimitReason } from "../../utils.js";
import type { IVaultV2Allocation } from "./VaultV2.js";

/** Deterministic helpers for Vault V2 allocation accounting. */
export namespace VaultV2Utils {
  /**
   * Computes the remaining assets permitted by one Vault V2 allocation's
   * absolute and relative caps.
   *
   * @param allocation - Current allocation and its absolute and relative caps.
   * @param firstTotalAssets - Transaction-frozen Vault V2 total assets used as the relative-cap denominator.
   * @returns The remaining allocation capacity and the cap that binds it.
   * @example
   * ```ts
   * import { VaultV2Utils } from "@morpho-org/blue-sdk";
   *
   * const headroom = VaultV2Utils.allocationHeadroom(
   *   { id: "0x0000000000000000000000000000000000000000000000000000000000000000", absoluteCap: 100n, relativeCap: 500000000000000000n, allocation: 40n },
   *   160n,
   * );
   * // headroom.value === 40n
   * ```
   */
  export function allocationHeadroom(
    allocation: Readonly<IVaultV2Allocation>,
    firstTotalAssets: BigIntish,
  ): CapacityLimit {
    const absoluteHeadroom = MathLib.zeroFloorSub(
      allocation.absoluteCap,
      allocation.allocation,
    );
    let limit: CapacityLimit = {
      value: absoluteHeadroom,
      limiter: CapacityLimitReason.vaultV2_absoluteCap,
    };

    if (allocation.relativeCap !== MathLib.WAD) {
      const relativeHeadroom = MathLib.zeroFloorSub(
        MathLib.wMulDown(BigInt(firstTotalAssets), allocation.relativeCap),
        allocation.allocation,
      );
      if (relativeHeadroom < limit.value) {
        limit = {
          value: relativeHeadroom,
          limiter: CapacityLimitReason.vaultV2_relativeCap,
        };
      }
    }

    return limit;
  }
}
