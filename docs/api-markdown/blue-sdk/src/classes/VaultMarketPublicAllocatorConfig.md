[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / VaultMarketPublicAllocatorConfig

# Class: VaultMarketPublicAllocatorConfig

Defined in: [packages/blue-sdk/src/vault/VaultMarketPublicAllocatorConfig.ts:14](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultMarketPublicAllocatorConfig.ts#L14)

Represents a vault market's PublicAllocator limits.

## Implements

- [`IVaultMarketPublicAllocatorConfig`](../interfaces/IVaultMarketPublicAllocatorConfig.md)

## Constructors

### Constructor

> **new VaultMarketPublicAllocatorConfig**(`__namedParameters`): `VaultMarketPublicAllocatorConfig`

Defined in: [packages/blue-sdk/src/vault/VaultMarketPublicAllocatorConfig.ts:37](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultMarketPublicAllocatorConfig.ts#L37)

#### Parameters

##### \_\_namedParameters

[`IVaultMarketPublicAllocatorConfig`](../interfaces/IVaultMarketPublicAllocatorConfig.md)

#### Returns

`VaultMarketPublicAllocatorConfig`

## Properties

### marketId

> `readonly` **marketId**: [`MarketId`](../type-aliases/MarketId.md)

Defined in: [packages/blue-sdk/src/vault/VaultMarketPublicAllocatorConfig.ts:25](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultMarketPublicAllocatorConfig.ts#L25)

The market's id.

#### Implementation of

[`IVaultMarketPublicAllocatorConfig`](../interfaces/IVaultMarketPublicAllocatorConfig.md).[`marketId`](../interfaces/IVaultMarketPublicAllocatorConfig.md#marketid)

***

### maxIn

> **maxIn**: `bigint`

Defined in: [packages/blue-sdk/src/vault/VaultMarketPublicAllocatorConfig.ts:30](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultMarketPublicAllocatorConfig.ts#L30)

The maximum amount of tokens that can be allocated to this market by the vault via the PublicAllocator.

#### Implementation of

[`IVaultMarketPublicAllocatorConfig`](../interfaces/IVaultMarketPublicAllocatorConfig.md).[`maxIn`](../interfaces/IVaultMarketPublicAllocatorConfig.md#maxin)

***

### maxOut

> **maxOut**: `bigint`

Defined in: [packages/blue-sdk/src/vault/VaultMarketPublicAllocatorConfig.ts:35](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultMarketPublicAllocatorConfig.ts#L35)

The maximum amount of tokens that can be allocated out of this market by the vault via the PublicAllocator.

#### Implementation of

[`IVaultMarketPublicAllocatorConfig`](../interfaces/IVaultMarketPublicAllocatorConfig.md).[`maxOut`](../interfaces/IVaultMarketPublicAllocatorConfig.md#maxout)

***

### vault

> `readonly` **vault**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/VaultMarketPublicAllocatorConfig.ts:20](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultMarketPublicAllocatorConfig.ts#L20)

The vault's address.

#### Implementation of

[`IVaultMarketPublicAllocatorConfig`](../interfaces/IVaultMarketPublicAllocatorConfig.md).[`vault`](../interfaces/IVaultMarketPublicAllocatorConfig.md#vault)
