[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / BlueRepayWithdrawCollateralAction

# Interface: BlueRepayWithdrawCollateralAction

Defined in: [packages/morpho-sdk/src/types/action.ts:249](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L249)

## Extends

- [`BaseAction`](BaseAction.md)\<`"blueRepayWithdrawCollateral"`, \{ `market`: `Hex`; `maxSharePrice`: `bigint`; `nativeAmount?`: `bigint`; `onBehalf`: `Address`; `receiver`: `Address`; `repayAssets`: `bigint`; `repayShares`: `bigint`; `transferAmount`: `bigint`; `withdrawAmount`: `bigint`; \}\>

## Properties

### args

> `readonly` **args**: `object`

Defined in: [packages/morpho-sdk/src/types/action.ts:14](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L14)

#### market

> **market**: `` `0x${string}` ``

#### maxSharePrice

> **maxSharePrice**: `bigint`

#### nativeAmount?

> `optional` **nativeAmount?**: `bigint`

Native token wrapped into wNative to fund the repay. Present when `> 0n`.

#### onBehalf

> **onBehalf**: `` `0x${string}` ``

#### receiver

> **receiver**: `` `0x${string}` ``

#### repayAssets

> **repayAssets**: `bigint`

#### repayShares

> **repayShares**: `bigint`

#### transferAmount

> **transferAmount**: `bigint`

#### withdrawAmount

> **withdrawAmount**: `bigint`

#### Inherited from

[`BaseAction`](BaseAction.md).[`args`](BaseAction.md#args)

***

### type

> `readonly` **type**: `"blueRepayWithdrawCollateral"`

Defined in: [packages/morpho-sdk/src/types/action.ts:13](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L13)

#### Inherited from

[`BaseAction`](BaseAction.md).[`type`](BaseAction.md#type)
