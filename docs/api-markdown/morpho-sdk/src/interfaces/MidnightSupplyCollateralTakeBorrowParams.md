[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / MidnightSupplyCollateralTakeBorrowParams

# Interface: MidnightSupplyCollateralTakeBorrowParams

Defined in: [packages/morpho-sdk/src/actions/midnight/supplyCollateralTakeBorrow.ts:17](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/supplyCollateralTakeBorrow.ts#L17)

Parameters for encoding a collateral supply followed by a Midnight borrow take.

## Extends

- [`MidnightTakeBorrowParams`](MidnightTakeBorrowParams.md)

## Properties

### chainId

> `readonly` **chainId**: `number`

Defined in: [packages/morpho-sdk/src/actions/midnight/takeBorrow.ts:23](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/takeBorrow.ts#L23)

#### Inherited from

[`MidnightTakeBorrowParams`](MidnightTakeBorrowParams.md).[`chainId`](MidnightTakeBorrowParams.md#chainid)

***

### collateralAssets

> `readonly` **collateralAssets**: `bigint`

Defined in: [packages/morpho-sdk/src/actions/midnight/supplyCollateralTakeBorrow.ts:19](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/supplyCollateralTakeBorrow.ts#L19)

***

### collateralIndex?

> `readonly` `optional` **collateralIndex?**: `bigint`

Defined in: [packages/morpho-sdk/src/actions/midnight/supplyCollateralTakeBorrow.ts:20](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/supplyCollateralTakeBorrow.ts#L20)

***

### deadline

> `readonly` **deadline**: `bigint`

Defined in: [packages/morpho-sdk/src/actions/midnight/takeBorrow.ts:29](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/takeBorrow.ts#L29)

Bundle execution deadline timestamp. Pass `maxUint256` explicitly for no expiry.

#### Inherited from

[`MidnightTakeBorrowParams`](MidnightTakeBorrowParams.md).[`deadline`](MidnightTakeBorrowParams.md#deadline)

***

### loanAssets

> `readonly` **loanAssets**: `bigint`

Defined in: [packages/morpho-sdk/src/actions/midnight/takeBorrow.ts:25](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/takeBorrow.ts#L25)

#### Inherited from

[`MidnightTakeBorrowParams`](MidnightTakeBorrowParams.md).[`loanAssets`](MidnightTakeBorrowParams.md#loanassets)

***

### market

> `readonly` **market**: [`MarketInput`](../../../midnight-sdk/src/type-aliases/MarketInput.md)

Defined in: [packages/morpho-sdk/src/actions/midnight/takeBorrow.ts:24](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/takeBorrow.ts#L24)

#### Inherited from

[`MidnightTakeBorrowParams`](MidnightTakeBorrowParams.md).[`market`](MidnightTakeBorrowParams.md#market)

***

### maxUnits

> `readonly` **maxUnits**: `bigint`

Defined in: [packages/morpho-sdk/src/actions/midnight/takeBorrow.ts:26](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/takeBorrow.ts#L26)

#### Inherited from

[`MidnightTakeBorrowParams`](MidnightTakeBorrowParams.md).[`maxUnits`](MidnightTakeBorrowParams.md#maxunits)

***

### metadata?

> `readonly` `optional` **metadata?**: [`Metadata`](Metadata.md)

Defined in: [packages/morpho-sdk/src/actions/midnight/takeBorrow.ts:31](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/takeBorrow.ts#L31)

#### Inherited from

[`MidnightTakeBorrowParams`](MidnightTakeBorrowParams.md).[`metadata`](MidnightTakeBorrowParams.md#metadata)

***

### takeableOffers

> `readonly` **takeableOffers**: readonly [`MidnightTakeableOffer`](MidnightTakeableOffer.md)[]

Defined in: [packages/morpho-sdk/src/actions/midnight/takeBorrow.ts:30](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/takeBorrow.ts#L30)

#### Inherited from

[`MidnightTakeBorrowParams`](MidnightTakeBorrowParams.md).[`takeableOffers`](MidnightTakeBorrowParams.md#takeableoffers)

***

### taker

> `readonly` **taker**: `` `0x${string}` ``

Defined in: [packages/morpho-sdk/src/actions/midnight/takeBorrow.ts:27](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/takeBorrow.ts#L27)

#### Inherited from

[`MidnightTakeBorrowParams`](MidnightTakeBorrowParams.md).[`taker`](MidnightTakeBorrowParams.md#taker)
