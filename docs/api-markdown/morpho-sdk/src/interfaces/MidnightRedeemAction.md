[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / MidnightRedeemAction

# Interface: MidnightRedeemAction

Defined in: [packages/morpho-sdk/src/types/action.ts:449](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L449)

Metadata for a direct Midnight credit redemption transaction.

## Extends

- [`BaseAction`](BaseAction.md)\<`"midnightRedeem"`, \{ `market`: `Hex`; `onBehalf`: `Address`; `receiver`: `Address`; `units`: `bigint`; \}\>

## Properties

### args

> `readonly` **args**: `object`

Defined in: [packages/morpho-sdk/src/types/action.ts:14](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L14)

#### market

> `readonly` **market**: `` `0x${string}` ``

#### onBehalf

> `readonly` **onBehalf**: `` `0x${string}` ``

#### receiver

> `readonly` **receiver**: `` `0x${string}` ``

#### units

> `readonly` **units**: `bigint`

#### Inherited from

[`BaseAction`](BaseAction.md).[`args`](BaseAction.md#args)

***

### type

> `readonly` **type**: `"midnightRedeem"`

Defined in: [packages/morpho-sdk/src/types/action.ts:13](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L13)

#### Inherited from

[`BaseAction`](BaseAction.md).[`type`](BaseAction.md#type)
