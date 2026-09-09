[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / BlueBorrowAction

# Interface: BlueBorrowAction

Defined in: [packages/morpho-sdk/src/types/action.ts:189](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L189)

## Extends

- [`BaseAction`](BaseAction.md)\<`"blueBorrow"`, \{ `amount`: `bigint`; `market`: `Hex`; `minSharePrice`: `bigint`; `reallocationFee`: `bigint`; `reallocationPenaltyAssets`: `bigint`; `receiver`: `Address`; \}\>

## Properties

### args

> `readonly` **args**: `object`

Defined in: [packages/morpho-sdk/src/types/action.ts:14](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L14)

#### amount

> **amount**: `bigint`

#### market

> **market**: `` `0x${string}` ``

#### minSharePrice

> **minSharePrice**: `bigint`

#### reallocationFee

> **reallocationFee**: `bigint`

Native-token fees paid to PublicAllocator V1.

#### reallocationPenaltyAssets

> `readonly` **reallocationPenaltyAssets**: `bigint`

Loan-token assets donated as BluePublicAllocator V2 penalties.

#### receiver

> **receiver**: `` `0x${string}` ``

#### Inherited from

[`BaseAction`](BaseAction.md).[`args`](BaseAction.md#args)

***

### type

> `readonly` **type**: `"blueBorrow"`

Defined in: [packages/morpho-sdk/src/types/action.ts:13](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L13)

#### Inherited from

[`BaseAction`](BaseAction.md).[`type`](BaseAction.md#type)
