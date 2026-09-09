[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / MidnightTakeBorrowParams

# Interface: MidnightTakeBorrowParams

Defined in: [packages/morpho-sdk/src/actions/midnight/takeBorrow.ts:22](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/takeBorrow.ts#L22)

Parameters for encoding a Midnight borrow take from already selected offers.

## Extended by

- [`MidnightSupplyCollateralTakeBorrowParams`](MidnightSupplyCollateralTakeBorrowParams.md)

## Properties

### chainId

> `readonly` **chainId**: `number`

Defined in: [packages/morpho-sdk/src/actions/midnight/takeBorrow.ts:23](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/takeBorrow.ts#L23)

***

### deadline

> `readonly` **deadline**: `bigint`

Defined in: [packages/morpho-sdk/src/actions/midnight/takeBorrow.ts:29](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/takeBorrow.ts#L29)

Bundle execution deadline timestamp. Pass `maxUint256` explicitly for no expiry.

***

### loanAssets

> `readonly` **loanAssets**: `bigint`

Defined in: [packages/morpho-sdk/src/actions/midnight/takeBorrow.ts:25](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/takeBorrow.ts#L25)

***

### market

> `readonly` **market**: [`MarketInput`](../../../midnight-sdk/src/type-aliases/MarketInput.md)

Defined in: [packages/morpho-sdk/src/actions/midnight/takeBorrow.ts:24](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/takeBorrow.ts#L24)

***

### maxUnits

> `readonly` **maxUnits**: `bigint`

Defined in: [packages/morpho-sdk/src/actions/midnight/takeBorrow.ts:26](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/takeBorrow.ts#L26)

***

### metadata?

> `readonly` `optional` **metadata?**: [`Metadata`](Metadata.md)

Defined in: [packages/morpho-sdk/src/actions/midnight/takeBorrow.ts:31](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/takeBorrow.ts#L31)

***

### takeableOffers

> `readonly` **takeableOffers**: readonly [`MidnightTakeableOffer`](MidnightTakeableOffer.md)[]

Defined in: [packages/morpho-sdk/src/actions/midnight/takeBorrow.ts:30](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/takeBorrow.ts#L30)

***

### taker

> `readonly` **taker**: `` `0x${string}` ``

Defined in: [packages/morpho-sdk/src/actions/midnight/takeBorrow.ts:27](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/takeBorrow.ts#L27)
