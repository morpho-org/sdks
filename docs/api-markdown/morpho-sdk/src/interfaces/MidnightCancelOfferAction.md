[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / MidnightCancelOfferAction

# Interface: MidnightCancelOfferAction

Defined in: [packages/morpho-sdk/src/types/action.ts:475](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L475)

Metadata for a direct Midnight offer-cancellation transaction.

## Extends

- [`BaseAction`](BaseAction.md)\<`"midnightCancelOffer"`, \{ `amount`: `bigint`; `group`: `Hex`; `onBehalf`: `Address`; \}\>

## Properties

### args

> `readonly` **args**: `object`

Defined in: [packages/morpho-sdk/src/types/action.ts:14](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L14)

#### amount

> `readonly` **amount**: `bigint`

#### group

> `readonly` **group**: `` `0x${string}` ``

#### onBehalf

> `readonly` **onBehalf**: `` `0x${string}` ``

#### Inherited from

[`BaseAction`](BaseAction.md).[`args`](BaseAction.md#args)

***

### type

> `readonly` **type**: `"midnightCancelOffer"`

Defined in: [packages/morpho-sdk/src/types/action.ts:13](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L13)

#### Inherited from

[`BaseAction`](BaseAction.md).[`type`](BaseAction.md#type)
