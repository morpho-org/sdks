[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / VaultMarketAllocation

# Class: VaultMarketAllocation

Defined in: [packages/blue-sdk/src/vault/VaultMarketAllocation.ts:16](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultMarketAllocation.ts#L16)

Represents a vault allocation on one Morpho Blue market.

## Implements

- [`IVaultMarketAllocation`](../interfaces/IVaultMarketAllocation.md)

## Constructors

### Constructor

> **new VaultMarketAllocation**(`__namedParameters`): `VaultMarketAllocation`

Defined in: [packages/blue-sdk/src/vault/VaultMarketAllocation.ts:27](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultMarketAllocation.ts#L27)

#### Parameters

##### \_\_namedParameters

[`IVaultMarketAllocation`](../interfaces/IVaultMarketAllocation.md)

#### Returns

`VaultMarketAllocation`

## Properties

### config

> `readonly` **config**: [`VaultMarketConfig`](VaultMarketConfig.md)

Defined in: [packages/blue-sdk/src/vault/VaultMarketAllocation.ts:20](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultMarketAllocation.ts#L20)

The vault's configuration on the corresponding market.

#### Implementation of

[`IVaultMarketAllocation`](../interfaces/IVaultMarketAllocation.md).[`config`](../interfaces/IVaultMarketAllocation.md#config)

***

### position

> `readonly` **position**: [`AccrualPosition`](AccrualPosition.md)

Defined in: [packages/blue-sdk/src/vault/VaultMarketAllocation.ts:25](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultMarketAllocation.ts#L25)

The vault's position on the corresponding market.

#### Implementation of

[`IVaultMarketAllocation`](../interfaces/IVaultMarketAllocation.md).[`position`](../interfaces/IVaultMarketAllocation.md#position)

## Accessors

### marketId

#### Get Signature

> **get** **marketId**(): [`MarketId`](../type-aliases/MarketId.md)

Defined in: [packages/blue-sdk/src/vault/VaultMarketAllocation.ts:36](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultMarketAllocation.ts#L36)

##### Returns

[`MarketId`](../type-aliases/MarketId.md)

***

### utilization

#### Get Signature

> **get** **utilization**(): `bigint`

Defined in: [packages/blue-sdk/src/vault/VaultMarketAllocation.ts:40](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultMarketAllocation.ts#L40)

##### Returns

`bigint`

***

### vault

#### Get Signature

> **get** **vault**(): `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/VaultMarketAllocation.ts:32](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultMarketAllocation.ts#L32)

##### Returns

`` `0x${string}` ``
