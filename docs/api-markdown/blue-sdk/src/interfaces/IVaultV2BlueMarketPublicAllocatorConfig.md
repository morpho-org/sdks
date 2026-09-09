[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / IVaultV2BlueMarketPublicAllocatorConfig

# Interface: IVaultV2BlueMarketPublicAllocatorConfig

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2BlueMarketPublicAllocatorConfig.ts:5](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2BlueMarketPublicAllocatorConfig.ts#L5)

Plain input shape for one Vault V2 adapter-market's BluePublicAllocator configuration.

## Properties

### absoluteCap

> `readonly` **absoluteCap**: `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2BlueMarketPublicAllocatorConfig.ts:13](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2BlueMarketPublicAllocatorConfig.ts#L13)

Maximum post-state allocation accepted by the allocator.

***

### adapter

> `readonly` **adapter**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2BlueMarketPublicAllocatorConfig.ts:9](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2BlueMarketPublicAllocatorConfig.ts#L9)

Vault V2 MorphoMarketV1AdapterV2 address.

***

### adapterMarketCapId

> `readonly` **adapterMarketCapId**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2BlueMarketPublicAllocatorConfig.ts:11](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2BlueMarketPublicAllocatorConfig.ts#L11)

Adapter-scoped market-parameters id used by the allocator mappings.

***

### canPullFromMarket

> `readonly` **canPullFromMarket**: `boolean`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2BlueMarketPublicAllocatorConfig.ts:15](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2BlueMarketPublicAllocatorConfig.ts#L15)

Whether the allocator may pull assets from this adapter-market pair.

***

### vault

> `readonly` **vault**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2BlueMarketPublicAllocatorConfig.ts:7](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2BlueMarketPublicAllocatorConfig.ts#L7)

Configured Vault V2 address.
