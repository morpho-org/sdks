[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / MidnightTakeBorrowAction

# Interface: MidnightTakeBorrowAction

Defined in: [packages/morpho-sdk/src/types/action.ts:390](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L390)

Metadata for a Midnight bundle that borrows from fixed-rate offers.

## Extends

- [`BaseAction`](BaseAction.md)\<`"midnightTakeBorrow"`, \{ `collateralSupplies`: `number`; `deadline`: `bigint`; `loanAssets`: `bigint`; `market`: `Hex`; `maxUnits`: `bigint`; `receiver`: `Address`; `takeableOffers`: `number`; `taker`: `Address`; \}\>

## Properties

### args

> `readonly` **args**: `object`

Defined in: [packages/morpho-sdk/src/types/action.ts:14](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L14)

#### collateralSupplies

> `readonly` **collateralSupplies**: `number`

#### deadline

> `readonly` **deadline**: `bigint`

#### loanAssets

> `readonly` **loanAssets**: `bigint`

#### market

> `readonly` **market**: `` `0x${string}` ``

#### maxUnits

> `readonly` **maxUnits**: `bigint`

#### receiver

> `readonly` **receiver**: `` `0x${string}` ``

#### takeableOffers

> `readonly` **takeableOffers**: `number`

#### taker

> `readonly` **taker**: `` `0x${string}` ``

#### Inherited from

[`BaseAction`](BaseAction.md).[`args`](BaseAction.md#args)

***

### type

> `readonly` **type**: `"midnightTakeBorrow"`

Defined in: [packages/morpho-sdk/src/types/action.ts:13](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/types/action.ts#L13)

#### Inherited from

[`BaseAction`](BaseAction.md).[`type`](BaseAction.md#type)
