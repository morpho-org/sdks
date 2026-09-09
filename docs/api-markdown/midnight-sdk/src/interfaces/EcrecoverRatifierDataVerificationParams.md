[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / EcrecoverRatifierDataVerificationParams

# Interface: EcrecoverRatifierDataVerificationParams

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:443](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L443)

Parameters for locally verifying Ecrecover ratifier data attached to one payload item.

## Properties

### chainId

> `readonly` **chainId**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:445](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L445)

Observed EIP-155 chain id from the log or execution context. Must match `offer.market.chainId`.

***

### offer

> `readonly` **offer**: [`IOffer`](IOffer.md)

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:447](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L447)

Offer carried by the payload item.

***

### ratifierData

> `readonly` **ratifierData**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:449](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L449)

ABI-encoded Ecrecover ratifier data carried by the payload item.
