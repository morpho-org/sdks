import type { Address, BigIntish, Hash } from "../../types.js";
import { VaultV2BlueMarketPublicAllocatorConfigUtils } from "./VaultV2BlueMarketPublicAllocatorConfigUtils.js";

/** Plain input shape for one Vault V2 adapter-market's BluePublicAllocator configuration. */
export interface IVaultV2BlueMarketPublicAllocatorConfig {
  /** Configured Vault V2 address. */
  readonly vault: Address;
  /** Vault V2 MorphoMarketV1AdapterV2 address. */
  readonly adapter: Address;
  /** Adapter-scoped market-parameters id used by the allocator mappings. */
  readonly adapterMarketCapId: Hash;
  /** Maximum post-state allocation accepted by the allocator. */
  readonly absoluteCap: bigint;
  /** Whether the allocator may pull assets from this adapter-market pair. */
  readonly canPullFromMarket: boolean;
}

/**
 * Represents BluePublicAllocator state for one Vault V2 adapter-market pair.
 *
 * @example
 * ```ts
 * import { VaultV2BlueMarketPublicAllocatorConfig } from "@morpho-org/blue-sdk";
 *
 * const config = new VaultV2BlueMarketPublicAllocatorConfig({
 *   vault: "0x0000000000000000000000000000000000000001",
 *   adapter: "0x0000000000000000000000000000000000000002",
 *   adapterMarketCapId: "0x0000000000000000000000000000000000000000000000000000000000000003",
 *   absoluteCap: 100n,
 *   canPullFromMarket: true,
 * });
 * ```
 */
export class VaultV2BlueMarketPublicAllocatorConfig
  implements IVaultV2BlueMarketPublicAllocatorConfig
{
  /** Configured Vault V2 address. */
  public readonly vault: Address;
  /** Vault V2 MorphoMarketV1AdapterV2 address. */
  public readonly adapter: Address;
  /** Adapter-scoped market-parameters id used by the allocator mappings. */
  public readonly adapterMarketCapId: Hash;
  /** Maximum post-state allocation accepted by the allocator. */
  public readonly absoluteCap: bigint;
  /** Whether the allocator may pull assets from this adapter-market pair. */
  public readonly canPullFromMarket: boolean;

  /**
   * Creates an adapter-market BluePublicAllocator configuration.
   *
   * @param config - Plain adapter-market allocator configuration.
   */
  public constructor({
    vault,
    adapter,
    adapterMarketCapId,
    absoluteCap,
    canPullFromMarket,
  }: IVaultV2BlueMarketPublicAllocatorConfig) {
    this.vault = vault;
    this.adapter = adapter;
    this.adapterMarketCapId = adapterMarketCapId;
    this.absoluteCap = absoluteCap;
    this.canPullFromMarket = canPullFromMarket;
  }

  /**
   * Computes the assets that may still be allocated under the allocator cap.
   *
   * @param allocation - Effective current allocation, including untracked assets.
   * @returns Remaining allocator capacity, floored at zero.
   * @example
   * ```ts
   * import { VaultV2BlueMarketPublicAllocatorConfig } from "@morpho-org/blue-sdk";
   *
   * const config = new VaultV2BlueMarketPublicAllocatorConfig({
   *   vault: "0x0000000000000000000000000000000000000001",
   *   adapter: "0x0000000000000000000000000000000000000002",
   *   adapterMarketCapId: "0x0000000000000000000000000000000000000000000000000000000000000003",
   *   absoluteCap: 100n,
   *   canPullFromMarket: true,
   * });
   * const maxIn = config.getMaxIn(40n);
   * // maxIn === 60n
   * ```
   */
  public getMaxIn(allocation: BigIntish) {
    return VaultV2BlueMarketPublicAllocatorConfigUtils.getMaxIn(
      this,
      allocation,
    );
  }
}
