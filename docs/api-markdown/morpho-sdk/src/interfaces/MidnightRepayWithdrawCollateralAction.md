[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / MidnightRepayWithdrawCollateralAction

# Interface: MidnightRepayWithdrawCollateralAction

Defined in: [packages/morpho-sdk/src/types/action.ts:461](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L461)

Metadata for a Midnight bundle that repays credit and/or withdraws collateral.

## Extends

- [`BaseAction`](BaseAction.md)\<`"midnightRepayWithdrawCollateral"`, \{ `collateralReceiver`: `Address`; `collateralWithdrawals`: `number`; `deadline`: `bigint`; `market`: `Hex`; `onBehalf`: `Address`; `repayAssets`: `bigint`; \}\>

## Properties

### args

> `readonly` **args**: `object`

Defined in: [packages/morpho-sdk/src/types/action.ts:14](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L14)

#### collateralReceiver

> `readonly` **collateralReceiver**: `` `0x${string}` ``

#### collateralWithdrawals

> `readonly` **collateralWithdrawals**: `number`

#### deadline

> `readonly` **deadline**: `bigint`

#### market

> `readonly` **market**: `` `0x${string}` ``

#### onBehalf

> `readonly` **onBehalf**: `` `0x${string}` ``

#### repayAssets

> `readonly` **repayAssets**: `bigint`

#### Inherited from

[`BaseAction`](BaseAction.md).[`args`](BaseAction.md#args)

***

### type

> `readonly` **type**: `"midnightRepayWithdrawCollateral"`

Defined in: [packages/morpho-sdk/src/types/action.ts:13](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L13)

#### Inherited from

[`BaseAction`](BaseAction.md).[`type`](BaseAction.md#type)
