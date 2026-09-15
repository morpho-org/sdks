import type { Address, MarketId } from "../types.js";

/**
 * The vault's configuration of a market on the PublicAllocator.
 * @deprecated Vault V1 PublicAllocator support is deprecated. Use {@link IVaultV2BlueMarketPublicAllocatorConfig} for Vault V2 integrations.
 */
export interface IVaultMarketPublicAllocatorConfig {
  /** @deprecated Vault V1 PublicAllocator support is deprecated. */
  vault: Address;
  /** @deprecated Vault V1 PublicAllocator support is deprecated. */
  marketId: MarketId;
  /** @deprecated Vault V1 PublicAllocator support is deprecated. */
  maxIn: bigint;
  /** @deprecated Vault V1 PublicAllocator support is deprecated. */
  maxOut: bigint;
}

/**
 * Represents a vault market's PublicAllocator limits.
 * @deprecated Vault V1 PublicAllocator support is deprecated. Use {@link VaultV2BlueMarketPublicAllocatorConfig} for Vault V2 integrations.
 */
export class VaultMarketPublicAllocatorConfig
  implements IVaultMarketPublicAllocatorConfig
{
  /**
   * The vault's address.
   * @deprecated Vault V1 PublicAllocator support is deprecated.
   */
  public readonly vault: Address;

  /**
   * The market's id.
   * @deprecated Vault V1 PublicAllocator support is deprecated.
   */
  public readonly marketId: MarketId;

  /**
   * The maximum amount of tokens that can be allocated to this market by the vault via the PublicAllocator.
   * @deprecated Vault V1 PublicAllocator support is deprecated.
   */
  public maxIn: bigint;

  /**
   * The maximum amount of tokens that can be allocated out of this market by the vault via the PublicAllocator.
   * @deprecated Vault V1 PublicAllocator support is deprecated.
   */
  public maxOut: bigint;

  /** @deprecated Vault V1 PublicAllocator support is deprecated. Use {@link VaultV2BlueMarketPublicAllocatorConfig} for Vault V2 integrations. */
  constructor({
    vault,
    marketId,
    maxIn,
    maxOut,
  }: IVaultMarketPublicAllocatorConfig) {
    this.vault = vault;
    this.marketId = marketId;
    this.maxIn = maxIn;
    this.maxOut = maxOut;
  }
}
