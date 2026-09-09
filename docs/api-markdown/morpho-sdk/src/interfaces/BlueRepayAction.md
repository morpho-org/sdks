[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / BlueRepayAction

# Interface: BlueRepayAction

Defined in: [packages/morpho-sdk/src/types/action.ts:222](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L222)

## Extends

- [`BaseAction`](BaseAction.md)\<`"blueRepay"`, \{ `assets`: `bigint`; `market`: `Hex`; `maxSharePrice`: `bigint`; `nativeAmount?`: `bigint`; `onBehalf`: `Address`; `receiver`: `Address`; `shares`: `bigint`; `transferAmount`: `bigint`; \}\>

## Properties

### args

> `readonly` **args**: `object`

Defined in: [packages/morpho-sdk/src/types/action.ts:14](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L14)

#### assets

> **assets**: `bigint`

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

#### shares

> **shares**: `bigint`

#### transferAmount

> **transferAmount**: `bigint`

#### Inherited from

[`BaseAction`](BaseAction.md).[`args`](BaseAction.md#args)

***

### type

> `readonly` **type**: `"blueRepay"`

Defined in: [packages/morpho-sdk/src/types/action.ts:13](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L13)

#### Inherited from

[`BaseAction`](BaseAction.md).[`type`](BaseAction.md#type)
