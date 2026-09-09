[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / EcrecoverRatifierRootDigestParams

# Interface: EcrecoverRatifierRootDigestParams

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:421](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L421)

Parameters for reconstructing an EcrecoverRatifier digest from decoded ratifier data fields.

## Properties

### chainId

> `readonly` **chainId**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:423](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L423)

Observed EIP-155 chain id from the log or execution context. Must match `offer.market.chainId`.

***

### offer

> `readonly` **offer**: [`IOffer`](IOffer.md)

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:425](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L425)

Offer whose ratifier address and market chain id define the EIP-712 domain.

***

### proofLength

> `readonly` **proofLength**: `number`

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:429](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L429)

Number of sibling hashes in the Merkle proof.

***

### root

> `readonly` **root**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:427](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L427)

Merkle root embedded in the ratifier data.
