[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / IAssetBalances

# Interface: IAssetBalances

Defined in: [packages/blue-sdk/src/holding/AssetBalances.ts:41](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/holding/AssetBalances.ts#L41)

Constructor input for `AssetBalances`.

## Extends

- `Omit`\<[`PeripheralBalance`](PeripheralBalance.md), `"type"`\>

## Properties

### dstAmount

> **dstAmount**: `bigint`

Defined in: [packages/blue-sdk/src/holding/AssetBalances.ts:37](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/holding/AssetBalances.ts#L37)

The corresponding amount of token held after conversion of the whole balance `srcAmount`.

#### Inherited from

[`PeripheralBalance`](PeripheralBalance.md).[`dstAmount`](PeripheralBalance.md#dstamount)

***

### srcAmount

> **srcAmount**: `bigint`

Defined in: [packages/blue-sdk/src/holding/AssetBalances.ts:33](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/holding/AssetBalances.ts#L33)

The source amount of source token held.

#### Inherited from

[`PeripheralBalance`](PeripheralBalance.md).[`srcAmount`](PeripheralBalance.md#srcamount)

***

### srcToken

> **srcToken**: [`Token`](../classes/Token.md)

Defined in: [packages/blue-sdk/src/holding/AssetBalances.ts:29](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/holding/AssetBalances.ts#L29)

The source token held corresponding to the type of balance conversion.

#### Inherited from

[`PeripheralBalance`](PeripheralBalance.md).[`srcToken`](PeripheralBalance.md#srctoken)
