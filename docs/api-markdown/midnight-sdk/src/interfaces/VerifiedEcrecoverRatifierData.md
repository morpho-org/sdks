[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / VerifiedEcrecoverRatifierData

# Interface: VerifiedEcrecoverRatifierData

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:453](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L453)

Decoded Ecrecover ratifier data after local proof verification and signature recovery.

## Extends

- [`DecodedEcrecoverRatifierData`](DecodedEcrecoverRatifierData.md)

## Properties

### leafIndex

> `readonly` **leafIndex**: `bigint`

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:181](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L181)

Leaf index in the tree.

#### Inherited from

[`DecodedEcrecoverRatifierData`](DecodedEcrecoverRatifierData.md).[`leafIndex`](DecodedEcrecoverRatifierData.md#leafindex)

***

### proof

> `readonly` **proof**: readonly `` `0x${string}` ``[]

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:183](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L183)

Sibling hashes from leaf to root.

#### Inherited from

[`DecodedEcrecoverRatifierData`](DecodedEcrecoverRatifierData.md).[`proof`](DecodedEcrecoverRatifierData.md#proof)

***

### root

> `readonly` **root**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:179](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L179)

Merkle root.

#### Inherited from

[`DecodedEcrecoverRatifierData`](DecodedEcrecoverRatifierData.md).[`root`](DecodedEcrecoverRatifierData.md#root)

***

### signature

> `readonly` **signature**: `Signature`\<`number`, `number`\> & `object`

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:168](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L168)

Ecrecover signature tuple decoded from ratifier data.

#### Type Declaration

##### v

> `readonly` **v**: `number`

#### Inherited from

[`DecodedEcrecoverRatifierData`](DecodedEcrecoverRatifierData.md).[`signature`](DecodedEcrecoverRatifierData.md#signature)

***

### signer

> `readonly` **signer**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:456](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L456)

Signer recovered from the Ecrecover typed-data digest.
