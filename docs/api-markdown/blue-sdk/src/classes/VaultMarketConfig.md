[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / VaultMarketConfig

# Class: VaultMarketConfig

Defined in: [packages/blue-sdk/src/vault/VaultMarketConfig.ts:18](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultMarketConfig.ts#L18)

Represents a vault's configuration on one Morpho Blue market.

## Implements

- [`IVaultMarketConfig`](../interfaces/IVaultMarketConfig.md)

## Constructors

### Constructor

> **new VaultMarketConfig**(`__namedParameters`): `VaultMarketConfig`

Defined in: [packages/blue-sdk/src/vault/VaultMarketConfig.ts:54](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultMarketConfig.ts#L54)

#### Parameters

##### \_\_namedParameters

[`IVaultMarketConfig`](../interfaces/IVaultMarketConfig.md)

#### Returns

`VaultMarketConfig`

## Properties

### cap

> **cap**: `bigint`

Defined in: [packages/blue-sdk/src/vault/VaultMarketConfig.ts:32](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultMarketConfig.ts#L32)

The maximum amount of tokens that can be allocated to this market.

#### Implementation of

[`IVaultMarketConfig`](../interfaces/IVaultMarketConfig.md).[`cap`](../interfaces/IVaultMarketConfig.md#cap)

***

### enabled

> **enabled**: `boolean`

Defined in: [packages/blue-sdk/src/vault/VaultMarketConfig.ts:47](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultMarketConfig.ts#L47)

Whether this market is enabled, i.e. whether additional tokens can be allocated to it.

#### Implementation of

[`IVaultMarketConfig`](../interfaces/IVaultMarketConfig.md).[`enabled`](../interfaces/IVaultMarketConfig.md#enabled)

***

### marketId

> `readonly` **marketId**: [`MarketId`](../type-aliases/MarketId.md)

Defined in: [packages/blue-sdk/src/vault/VaultMarketConfig.ts:27](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultMarketConfig.ts#L27)

The market's id.

#### Implementation of

[`IVaultMarketConfig`](../interfaces/IVaultMarketConfig.md).[`marketId`](../interfaces/IVaultMarketConfig.md#marketid)

***

### pendingCap

> **pendingCap**: [`Pending`](../interfaces/Pending.md)\<`bigint`\>

Defined in: [packages/blue-sdk/src/vault/VaultMarketConfig.ts:37](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultMarketConfig.ts#L37)

The pending maximum amount of tokens that can be allocated to this market.

#### Implementation of

[`IVaultMarketConfig`](../interfaces/IVaultMarketConfig.md).[`pendingCap`](../interfaces/IVaultMarketConfig.md#pendingcap)

***

### publicAllocatorConfig?

> `readonly` `optional` **publicAllocatorConfig?**: [`VaultMarketPublicAllocatorConfig`](VaultMarketPublicAllocatorConfig.md)

Defined in: [packages/blue-sdk/src/vault/VaultMarketConfig.ts:52](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultMarketConfig.ts#L52)

The vault's PublicAllocator configuration on the corresponding market.

#### Implementation of

[`IVaultMarketConfig`](../interfaces/IVaultMarketConfig.md).[`publicAllocatorConfig`](../interfaces/IVaultMarketConfig.md#publicallocatorconfig)

***

### removableAt

> **removableAt**: `bigint`

Defined in: [packages/blue-sdk/src/vault/VaultMarketConfig.ts:42](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultMarketConfig.ts#L42)

The timestamp at which the market can be removed from the withdraw queue.

#### Implementation of

[`IVaultMarketConfig`](../interfaces/IVaultMarketConfig.md).[`removableAt`](../interfaces/IVaultMarketConfig.md#removableat)

***

### vault

> `readonly` **vault**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/VaultMarketConfig.ts:22](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultMarketConfig.ts#L22)

The vault's address.

#### Implementation of

[`IVaultMarketConfig`](../interfaces/IVaultMarketConfig.md).[`vault`](../interfaces/IVaultMarketConfig.md#vault)
