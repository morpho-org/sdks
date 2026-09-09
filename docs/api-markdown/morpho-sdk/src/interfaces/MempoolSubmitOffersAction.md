[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / MempoolSubmitOffersAction

# Interface: MempoolSubmitOffersAction

Defined in: [packages/morpho-sdk/src/types/action.ts:435](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L435)

Metadata for a Midnight mempool payload submission.

## Extends

- [`BaseAction`](BaseAction.md)\<`"mempoolSubmitOffers"`, \{ `groups`: readonly `Hex`[]; `maker`: `Address`; `offers`: `number`; `ratifier`: `Address`; `ratifierType`: `"ecrecover"` \| `"setter"`; `root`: `Hex`; \}\>

## Properties

### args

> `readonly` **args**: `object`

Defined in: [packages/morpho-sdk/src/types/action.ts:14](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L14)

#### groups

> `readonly` **groups**: readonly `` `0x${string}` ``[]

#### maker

> `readonly` **maker**: `` `0x${string}` ``

#### offers

> `readonly` **offers**: `number`

#### ratifier

> `readonly` **ratifier**: `` `0x${string}` ``

#### ratifierType

> `readonly` **ratifierType**: `"ecrecover"` \| `"setter"`

#### root

> `readonly` **root**: `` `0x${string}` ``

#### Inherited from

[`BaseAction`](BaseAction.md).[`args`](BaseAction.md#args)

***

### type

> `readonly` **type**: `"mempoolSubmitOffers"`

Defined in: [packages/morpho-sdk/src/types/action.ts:13](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L13)

#### Inherited from

[`BaseAction`](BaseAction.md).[`type`](BaseAction.md#type)
