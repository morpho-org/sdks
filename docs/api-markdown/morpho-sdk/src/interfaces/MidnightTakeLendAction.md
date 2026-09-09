[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / MidnightTakeLendAction

# Interface: MidnightTakeLendAction

Defined in: [packages/morpho-sdk/src/types/action.ts:376](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L376)

Metadata for a Midnight bundle that lends into fixed-rate offers.

## Extends

- [`BaseAction`](BaseAction.md)\<`"midnightTakeLend"`, \{ `assets`: `bigint`; `deadline`: `bigint`; `market`: `Hex`; `minUnits`: `bigint`; `takeableOffers`: `number`; `taker`: `Address`; \}\>

## Properties

### args

> `readonly` **args**: `object`

Defined in: [packages/morpho-sdk/src/types/action.ts:14](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L14)

#### assets

> `readonly` **assets**: `bigint`

#### deadline

> `readonly` **deadline**: `bigint`

#### market

> `readonly` **market**: `` `0x${string}` ``

#### minUnits

> `readonly` **minUnits**: `bigint`

#### takeableOffers

> `readonly` **takeableOffers**: `number`

#### taker

> `readonly` **taker**: `` `0x${string}` ``

#### Inherited from

[`BaseAction`](BaseAction.md).[`args`](BaseAction.md#args)

***

### type

> `readonly` **type**: `"midnightTakeLend"`

Defined in: [packages/morpho-sdk/src/types/action.ts:13](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L13)

#### Inherited from

[`BaseAction`](BaseAction.md).[`type`](BaseAction.md#type)
