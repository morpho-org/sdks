[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / IAccrualVaultV2Adapter

# Interface: IAccrualVaultV2Adapter

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:38](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L38)

Adapter interface with accrued asset and capacity methods.

## Extends

- [`IVaultV2Adapter`](IVaultV2Adapter.md)

## Properties

### adapterId

> **adapterId**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:10](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L10)

#### Inherited from

[`IVaultV2Adapter`](IVaultV2Adapter.md).[`adapterId`](IVaultV2Adapter.md#adapterid)

***

### address

> **address**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:8](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L8)

#### Inherited from

[`IVaultV2Adapter`](IVaultV2Adapter.md).[`address`](IVaultV2Adapter.md#address)

***

### parentVault

> **parentVault**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:9](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L9)

#### Inherited from

[`IVaultV2Adapter`](IVaultV2Adapter.md).[`parentVault`](IVaultV2Adapter.md#parentvault)

***

### skimRecipient

> **skimRecipient**: `` `0x${string}` ``

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:11](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L11)

#### Inherited from

[`IVaultV2Adapter`](IVaultV2Adapter.md).[`skimRecipient`](IVaultV2Adapter.md#skimrecipient)

***

### type

> **type**: `string`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:7](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L7)

#### Inherited from

[`IVaultV2Adapter`](IVaultV2Adapter.md).[`type`](IVaultV2Adapter.md#type)

## Methods

### maxDeposit()

> **maxDeposit**(`data`, `assets`): [`CapacityLimit`](CapacityLimit.md)

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:45](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L45)

Returns the maximum amount of assets that can be deposited to this adapter.

#### Parameters

##### data

`` `0x${string}` ``

##### assets

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

The maximum amount of assets to deposit.

#### Returns

[`CapacityLimit`](CapacityLimit.md)

***

### maxWithdraw()

> **maxWithdraw**(`data`): [`CapacityLimit`](CapacityLimit.md)

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:50](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L50)

Returns the maximum amount of assets that can be withdrawn from this adapter.

#### Parameters

##### data

`` `0x${string}` ``

#### Returns

[`CapacityLimit`](CapacityLimit.md)

***

### realAssets()

> **realAssets**(`timestamp`): `bigint`

Defined in: [packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts:39](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/v2/VaultV2Adapter.ts#L39)

#### Parameters

##### timestamp

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

#### Returns

`bigint`
