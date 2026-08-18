import type { Address, Hash } from "../../types.js";

/** Public allocator configuration for one Vault V2. */
export interface VaultV2PublicAllocatorConfig {
  /** Configured Vault V2 address. */
  readonly vault: Address;
  /** Whether the allocator may pull the vault's idle assets into a Blue market. */
  readonly canPullFromIdle: boolean;
  /** Proportional vault-asset penalty charged for each call, scaled by WAD. */
  readonly penalty: bigint;
}

/** Public allocator permission and cap for one Vault V2 adapter-market pair. */
export interface VaultV2MarketPublicAllocatorConfig {
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
