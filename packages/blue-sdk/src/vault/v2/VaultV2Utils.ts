import { type AbiParameter, encodeAbiParameters, keccak256 } from "viem";
import { MathLib } from "../../math/index.js";
import type { Address, BigIntish, Hash } from "../../types.js";
import { type CapacityLimit, CapacityLimitReason } from "../../utils.js";
import type { IVaultV2Allocation } from "./VaultV2.js";

/** Deterministic helpers for Vault V2 allocation accounting. */
export namespace VaultV2Utils {
  /**
   * Computes the allocation-cap id for an adapter address.
   *
   * @param address - Adapter address.
   * @returns The adapter allocation-cap id.
   * @throws {viem.InvalidAddressError} when `address` is not a valid address.
   * @example
   * ```ts
   * import { VaultV2Utils } from "@morpho-org/blue-sdk";
   *
   * const id = VaultV2Utils.adapterCapId("0x0000000000000000000000000000000000000001");
   * ```
   */
  export function adapterCapId(address: Address): Hash {
    return capId({
      tag: "this",
      params: [{ type: "address" }],
      values: [address],
    });
  }

  /**
   * Computes the allocation-cap id for a collateral token.
   *
   * @param token - Collateral token address.
   * @returns The collateral-token allocation-cap id.
   * @throws {viem.InvalidAddressError} when `token` is not a valid address.
   * @example
   * ```ts
   * import { VaultV2Utils } from "@morpho-org/blue-sdk";
   *
   * const id = VaultV2Utils.collateralCapId("0x0000000000000000000000000000000000000001");
   * ```
   */
  export function collateralCapId(token: Address): Hash {
    return capId({
      tag: "collateralToken",
      params: [{ type: "address" }],
      values: [token],
    });
  }

  /**
   * The shared encoder behind the typed cap-id helpers; it is not part of the stability contract.
   *
   * @internal
   * @param params.tag - Contract cap-id tag.
   * @param params.params - ABI parameters encoded after the tag.
   * @param params.values - Values matching `params.params`.
   * @returns The allocation-cap id.
   * @throws {viem.InvalidAddressError} when an address value is invalid.
   * @throws {viem.IntegerOutOfRangeError} when an integer value does not fit its ABI type.
   * @example
   * ```ts
   * import { VaultV2Utils } from "@morpho-org/blue-sdk";
   *
   * const id = VaultV2Utils.capId({
   *   tag: "this",
   *   params: [{ type: "address" }],
   *   values: ["0x0000000000000000000000000000000000000001"],
   * });
   * ```
   */
  export function capId<const P extends readonly AbiParameter[]>({
    tag,
    params,
    values,
  }: {
    readonly tag: string;
    readonly params: P;
    readonly values: Parameters<typeof encodeAbiParameters<P>>[1];
  }): Hash {
    return keccak256(
      encodeAbiParameters<readonly AbiParameter[]>(
        [{ type: "string" }, ...params],
        [tag, ...values],
      ),
    );
  }

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
    allocation: Readonly<
      Pick<IVaultV2Allocation, "allocation" | "absoluteCap" | "relativeCap"> &
        Partial<Pick<IVaultV2Allocation, "id">>
    >,
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
