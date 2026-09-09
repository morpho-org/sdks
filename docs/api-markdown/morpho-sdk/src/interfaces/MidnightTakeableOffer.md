[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / MidnightTakeableOffer

# Interface: MidnightTakeableOffer

Defined in: [packages/morpho-sdk/src/actions/midnight/types.ts:41](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/types.ts#L41)

ABI-ready Midnight takeable offer returned by quote/takeable-offer APIs.

Pass these objects unchanged into `takeLend`, `takeBorrow`, or
`supplyCollateralTakeBorrow`; the action builders validate side and market
consistency before encoding the bundle.

## Properties

### offer

> `readonly` **offer**: [`OfferStruct`](../../../midnight-sdk/src/interfaces/OfferStruct.md)

Defined in: [packages/morpho-sdk/src/actions/midnight/types.ts:43](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/types.ts#L43)

***

### ratifierData

> `readonly` **ratifierData**: `` `0x${string}` ``

Defined in: [packages/morpho-sdk/src/actions/midnight/types.ts:44](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/types.ts#L44)

***

### units

> `readonly` **units**: `bigint`

Defined in: [packages/morpho-sdk/src/actions/midnight/types.ts:42](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/midnight/types.ts#L42)
