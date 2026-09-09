[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / MidnightTakeLendParams

# Interface: MidnightTakeLendParams

Defined in: [packages/morpho-sdk/src/actions/midnight/takeLend.ts:22](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/takeLend.ts#L22)

Parameters for encoding a Midnight lend take from already selected offers.

## Properties

### assets

> `readonly` **assets**: `bigint`

Defined in: [packages/morpho-sdk/src/actions/midnight/takeLend.ts:25](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/takeLend.ts#L25)

***

### chainId

> `readonly` **chainId**: `number`

Defined in: [packages/morpho-sdk/src/actions/midnight/takeLend.ts:23](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/takeLend.ts#L23)

***

### deadline

> `readonly` **deadline**: `bigint`

Defined in: [packages/morpho-sdk/src/actions/midnight/takeLend.ts:30](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/takeLend.ts#L30)

Bundle execution deadline timestamp. Pass `maxUint256` explicitly for no expiry.

***

### market

> `readonly` **market**: [`MarketInput`](../../../midnight-sdk/src/type-aliases/MarketInput.md)

Defined in: [packages/morpho-sdk/src/actions/midnight/takeLend.ts:24](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/takeLend.ts#L24)

***

### metadata?

> `readonly` `optional` **metadata?**: [`Metadata`](Metadata.md)

Defined in: [packages/morpho-sdk/src/actions/midnight/takeLend.ts:31](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/takeLend.ts#L31)

***

### minUnits

> `readonly` **minUnits**: `bigint`

Defined in: [packages/morpho-sdk/src/actions/midnight/takeLend.ts:26](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/takeLend.ts#L26)

***

### takeableOffers

> `readonly` **takeableOffers**: readonly [`MidnightTakeableOffer`](MidnightTakeableOffer.md)[]

Defined in: [packages/morpho-sdk/src/actions/midnight/takeLend.ts:28](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/takeLend.ts#L28)

***

### taker

> `readonly` **taker**: `` `0x${string}` ``

Defined in: [packages/morpho-sdk/src/actions/midnight/takeLend.ts:27](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/takeLend.ts#L27)
