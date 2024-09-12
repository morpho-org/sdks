import { Address, MarketId } from "../types";

import { Pending } from "./Vault";
import { VaultMarketPublicAllocatorConfig } from "./VaultMarketPublicAllocatorConfig";

export interface InputVaultMarketConfig {
  vault: Address;
  marketId: MarketId;
  cap: bigint;
  pendingCap: Pending<bigint>;
  removableAt: bigint;
  enabled: boolean;
  publicAllocatorConfig: VaultMarketPublicAllocatorConfig;
}

export class VaultMarketConfig implements InputVaultMarketConfig {
  /**
   * The vault's address.
   */
  public vault: Address;

  /**
   * The market's id.
   */
  public marketId: MarketId;

  /**
   * The maximum amount of tokens that can be allocated to this market.
   */
  public cap: bigint;

  /**
   * The pending maximum amount of tokens that can be allocated to this market.
   */
  public pendingCap: Pending<bigint>;

  /**
   * The timestamp at which the market can be removed from the withdraw queue.
   */
  public removableAt: bigint;

  /**
   * Whether this market is enabled, i.e. whether additional tokens can be allocated to it.
   */
  public enabled: boolean;

  /**
   * The vault's PublicAllocator configuration on the corresponding market.
   */
  public publicAllocatorConfig: VaultMarketPublicAllocatorConfig;

  constructor({
    vault,
    marketId,
    cap,
    pendingCap,
    removableAt,
    enabled,
    publicAllocatorConfig,
  }: InputVaultMarketConfig) {
    this.vault = vault;
    this.marketId = marketId;
    this.cap = cap;
    this.pendingCap = pendingCap;
    this.removableAt = removableAt;
    this.enabled = enabled;
    this.publicAllocatorConfig = publicAllocatorConfig;
  }
}
