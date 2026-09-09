[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / IVaultV2BluePublicAllocatorConfig

# Interface: IVaultV2BluePublicAllocatorConfig

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2BluePublicAllocatorConfig.ts:5](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2BluePublicAllocatorConfig.ts#L5)

Plain input shape for one Vault V2's BluePublicAllocator configuration.

## Properties

### canPullFromIdle

> `readonly` **canPullFromIdle**: `boolean`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2BluePublicAllocatorConfig.ts:9](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2BluePublicAllocatorConfig.ts#L9)

Whether the allocator may pull the vault's idle assets into a Blue market.

***

### penalty

> `readonly` **penalty**: `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2BluePublicAllocatorConfig.ts:11](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2BluePublicAllocatorConfig.ts#L11)

Proportional vault-asset penalty charged for each call, scaled by WAD.

***

### vault

> `readonly` **vault**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2BluePublicAllocatorConfig.ts:7](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2BluePublicAllocatorConfig.ts#L7)

Configured Vault V2 address.
