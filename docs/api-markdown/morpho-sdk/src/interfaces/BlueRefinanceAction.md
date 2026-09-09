[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / BlueRefinanceAction

# Interface: BlueRefinanceAction

Defined in: [packages/morpho-sdk/src/types/action.ts:266](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L266)

## Extends

- [`BaseAction`](BaseAction.md)\<`"blueRefinance"`, \{ `borrowAssets`: `bigint`; `borrowShares`: `bigint`; `collateralAmount`: `bigint`; `maxRepaySharePrice`: `bigint`; `minBorrowSharePrice`: `bigint`; `reallocationFee`: `bigint`; `reallocationPenaltyAssets`: `bigint`; `sourceMarket`: `Hex`; `targetMarket`: `Hex`; `user`: `Address`; \}\>

## Properties

### args

> `readonly` **args**: `object`

Defined in: [packages/morpho-sdk/src/types/action.ts:14](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L14)

#### borrowAssets

> `readonly` **borrowAssets**: `bigint`

#### borrowShares

> `readonly` **borrowShares**: `bigint`

#### collateralAmount

> `readonly` **collateralAmount**: `bigint`

#### maxRepaySharePrice

> `readonly` **maxRepaySharePrice**: `bigint`

#### minBorrowSharePrice

> `readonly` **minBorrowSharePrice**: `bigint`

#### reallocationFee

> `readonly` **reallocationFee**: `bigint`

Native-token fees paid to PublicAllocator V1.

#### reallocationPenaltyAssets

> `readonly` **reallocationPenaltyAssets**: `bigint`

Loan-token assets donated as BluePublicAllocator V2 penalties.

#### sourceMarket

> `readonly` **sourceMarket**: `` `0x${string}` ``

#### targetMarket

> `readonly` **targetMarket**: `` `0x${string}` ``

#### user

> `readonly` **user**: `` `0x${string}` ``

#### Inherited from

[`BaseAction`](BaseAction.md).[`args`](BaseAction.md#args)

***

### type

> `readonly` **type**: `"blueRefinance"`

Defined in: [packages/morpho-sdk/src/types/action.ts:13](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L13)

#### Inherited from

[`BaseAction`](BaseAction.md).[`type`](BaseAction.md#type)
