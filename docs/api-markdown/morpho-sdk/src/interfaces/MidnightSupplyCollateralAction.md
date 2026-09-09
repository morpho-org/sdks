[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / MidnightSupplyCollateralAction

# Interface: MidnightSupplyCollateralAction

Defined in: [packages/morpho-sdk/src/types/action.ts:423](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L423)

Metadata for a direct Midnight collateral-supply transaction.

## Extends

- [`BaseAction`](BaseAction.md)\<`"midnightSupplyCollateral"`, \{ `assets`: `bigint`; `collateralIndex`: `bigint`; `market`: `Hex`; `onBehalf`: `Address`; \}\>

## Properties

### args

> `readonly` **args**: `object`

Defined in: [packages/morpho-sdk/src/types/action.ts:14](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L14)

#### assets

> `readonly` **assets**: `bigint`

#### collateralIndex

> `readonly` **collateralIndex**: `bigint`

#### market

> `readonly` **market**: `` `0x${string}` ``

#### onBehalf

> `readonly` **onBehalf**: `` `0x${string}` ``

#### Inherited from

[`BaseAction`](BaseAction.md).[`args`](BaseAction.md#args)

***

### type

> `readonly` **type**: `"midnightSupplyCollateral"`

Defined in: [packages/morpho-sdk/src/types/action.ts:13](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L13)

#### Inherited from

[`BaseAction`](BaseAction.md).[`type`](BaseAction.md#type)
