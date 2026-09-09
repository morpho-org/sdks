[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / EcrecoverRatifierDataDigestParams

# Interface: EcrecoverRatifierDataDigestParams

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:433](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L433)

Parameters for reconstructing an EcrecoverRatifier digest from encoded ratifier data.

## Properties

### chainId

> `readonly` **chainId**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:435](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L435)

Observed EIP-155 chain id from the log or execution context. Must match `offer.market.chainId`.

***

### offer

> `readonly` **offer**: [`IOffer`](IOffer.md)

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:437](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L437)

Offer carried by the payload item.

***

### ratifierData

> `readonly` **ratifierData**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:439](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L439)

ABI-encoded Ecrecover ratifier data carried by the payload item.
