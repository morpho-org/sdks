import type { Address, MarketId } from "../types";

/**
 * The vault's configuration of a market on the PublicAllocator.
 */
export interface InputVaultMarketPublicAllocatorConfig {
  vault: Address;
  marketId: MarketId;
  maxIn: bigint;
  maxOut: bigint;
}

export class VaultMarketPublicAllocatorConfig
  implements InputVaultMarketPublicAllocatorConfig
{
  /**
   * The vault's address.
   */
  public readonly vault: Address;

  /**
   * The market's id.
   */
  public readonly marketId: MarketId;

  /**
   * The maximum amount of tokens that can be allocated to this market by the vault via the PublicAllocator.
   */
  public maxIn: bigint;

  /**
   * The maximum amount of tokens that can be allocated out of this market by the vault via the PublicAllocator.
   */
  public maxOut: bigint;

  constructor({
    vault,
    marketId,
    maxIn,
    maxOut,
  }: InputVaultMarketPublicAllocatorConfig) {
    this.vault = vault;
    this.marketId = marketId;
    this.maxIn = maxIn;
    this.maxOut = maxOut;
  }
}
