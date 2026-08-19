import type { Address, BigIntish, Hash } from "../../types.js";
import { VaultV2BluePublicAllocatorConfigUtils } from "./VaultV2BluePublicAllocatorConfigUtils.js";

/** Plain input shape for one Vault V2's BluePublicAllocator configuration. */
export interface IVaultV2BluePublicAllocatorConfig {
  /** Configured Vault V2 address. */
  readonly vault: Address;
  /** Whether the allocator may pull the vault's idle assets into a Blue market. */
  readonly canPullFromIdle: boolean;
  /** Proportional vault-asset penalty charged for each call, scaled by WAD. */
  readonly penalty: bigint;
}

/**
 * Represents one Vault V2's BluePublicAllocator configuration.
 *
 * @example
 * ```ts
 * import { VaultV2BluePublicAllocatorConfig } from "@morpho-org/blue-sdk";
 *
 * const config = new VaultV2BluePublicAllocatorConfig({
 *   vault: "0x0000000000000000000000000000000000000001",
 *   canPullFromIdle: true,
 *   penalty: 500_000_000_000_000_000n,
 * });
 * ```
 */
export class VaultV2BluePublicAllocatorConfig
  implements IVaultV2BluePublicAllocatorConfig
{
  /** Configured Vault V2 address. */
  public readonly vault: Address;
  /** Whether the allocator may pull the vault's idle assets into a Blue market. */
  public readonly canPullFromIdle: boolean;
  /** Proportional vault-asset penalty charged for each call, scaled by WAD. */
  public readonly penalty: bigint;

  /**
   * Creates a Vault V2 BluePublicAllocator configuration.
   *
   * @param config - Plain allocator configuration.
   */
  public constructor({
    vault,
    canPullFromIdle,
    penalty,
  }: IVaultV2BluePublicAllocatorConfig) {
    this.vault = vault;
    this.canPullFromIdle = canPullFromIdle;
    this.penalty = penalty;
  }

  /**
   * Computes the independently rounded penalty charged for one reallocation.
   *
   * @param assets - Assets reallocated by the allocator.
   * @returns Penalty assets rounded up exactly as the allocator charges them.
   * @example
   * ```ts
   * import { VaultV2BluePublicAllocatorConfig } from "@morpho-org/blue-sdk";
   *
   * const config = new VaultV2BluePublicAllocatorConfig({
   *   vault: "0x0000000000000000000000000000000000000001",
   *   canPullFromIdle: true,
   *   penalty: 500_000_000_000_000_000n,
   * });
   * const penaltyAssets = config.getPenaltyAssets(3n);
   * // penaltyAssets === 2n
   * ```
   */
  public getPenaltyAssets(assets: BigIntish) {
    return VaultV2BluePublicAllocatorConfigUtils.getPenaltyAssets(this, assets);
  }
}

/** BluePublicAllocator permission and cap for one Vault V2 adapter-market pair. */
export interface VaultV2BlueMarketPublicAllocatorConfig {
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
