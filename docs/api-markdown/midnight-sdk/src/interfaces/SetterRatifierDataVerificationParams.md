[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / SetterRatifierDataVerificationParams

# Interface: SetterRatifierDataVerificationParams

Defined in: [packages/midnight-sdk/src/signatures/SetterRatifierUtils.ts:99](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/SetterRatifierUtils.ts#L99)

Parameters for locally verifying Setter ratifier data attached to one payload item.

## Properties

### offer

> `readonly` **offer**: [`IOffer`](IOffer.md)

Defined in: [packages/midnight-sdk/src/signatures/SetterRatifierUtils.ts:101](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/SetterRatifierUtils.ts#L101)

Offer carried by the payload item.

***

### ratifierData

> `readonly` **ratifierData**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/signatures/SetterRatifierUtils.ts:103](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/SetterRatifierUtils.ts#L103)

ABI-encoded Setter ratifier data carried by the payload item.
