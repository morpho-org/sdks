[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / AssetBalances

# Class: AssetBalances

Defined in: [packages/blue-sdk/src/holding/AssetBalances.ts:44](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/holding/AssetBalances.ts#L44)

Aggregates balances across a requested token and related peripheral tokens.

## Constructors

### Constructor

> **new AssetBalances**(`balance`): `AssetBalances`

Defined in: [packages/blue-sdk/src/holding/AssetBalances.ts:57](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/holding/AssetBalances.ts#L57)

#### Parameters

##### balance

[`IAssetBalances`](../interfaces/IAssetBalances.md)

#### Returns

`AssetBalances`

## Properties

### allocations

> **allocations**: `object` & `object`

Defined in: [packages/blue-sdk/src/holding/AssetBalances.ts:53](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/holding/AssetBalances.ts#L53)

The balance of each type of related tokens and the corresponding underlying balance.

#### Type Declaration

##### base

> **base**: [`PeripheralBalance`](../interfaces/PeripheralBalance.md)

#### Type Declaration

##### staked-wrapped?

> `optional` **staked-wrapped?**: [`PeripheralBalance`](../interfaces/PeripheralBalance.md)

##### unwrapped-staked-wrapped?

> `optional` **unwrapped-staked-wrapped?**: [`PeripheralBalance`](../interfaces/PeripheralBalance.md)

##### vault?

> `optional` **vault?**: [`PeripheralBalance`](../interfaces/PeripheralBalance.md)

##### wrapped?

> `optional` **wrapped?**: [`PeripheralBalance`](../interfaces/PeripheralBalance.md)

##### wrapped-vault?

> `optional` **wrapped-vault?**: [`PeripheralBalance`](../interfaces/PeripheralBalance.md)

***

### total

> **total**: `bigint`

Defined in: [packages/blue-sdk/src/holding/AssetBalances.ts:48](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/holding/AssetBalances.ts#L48)

The total balance of all types of related tokens.

## Methods

### add()

> **add**(`balance`): `AssetBalances`

Defined in: [packages/blue-sdk/src/holding/AssetBalances.ts:64](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/holding/AssetBalances.ts#L64)

#### Parameters

##### balance

[`PeripheralBalance`](../interfaces/PeripheralBalance.md)

#### Returns

`AssetBalances`

***

### sub()

> **sub**(`balance`): `AssetBalances`

Defined in: [packages/blue-sdk/src/holding/AssetBalances.ts:79](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/holding/AssetBalances.ts#L79)

#### Parameters

##### balance

[`PeripheralBalance`](../interfaces/PeripheralBalance.md)

#### Returns

`AssetBalances`
