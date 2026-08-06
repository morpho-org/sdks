import type { Address, Hash } from "viem";

/** Public allocator configuration for one Vault V2. */
export interface VaultV2PublicAllocatorConfig {
  /** BluePublicAllocator contract from which the configuration was read. */
  readonly allocator: Address;
  /** Configured Vault V2 address. */
  readonly vault: Address;
  /** Whether the allocator may move the vault's idle assets into a Blue market. */
  readonly canAllocateFromIdle: boolean;
  /** Native-token penalty charged for each allocator call. */
  readonly nativePenalty: bigint;
}

/** Public allocator permissions and cap for one Vault V2 adapter-market pair. */
export interface VaultV2MarketPublicAllocatorConfig {
  /** BluePublicAllocator contract from which the configuration was read. */
  readonly allocator: Address;
  /** Configured Vault V2 address. */
  readonly vault: Address;
  /** Vault V2 MorphoMarketV1AdapterV2 address. */
  readonly adapter: Address;
  /** Adapter-scoped `marketParamsId` used by the allocator mappings. */
  readonly marketParamsId: Hash;
  /** Maximum post-state allocation accepted by the allocator. */
  readonly absoluteCap: bigint;
  /** Whether the allocator may deallocate this adapter-market pair. */
  readonly canDeallocate: boolean;
  /** Whether the allocator currently recognizes the adapter. */
  readonly isActiveAdapter: boolean;
}
