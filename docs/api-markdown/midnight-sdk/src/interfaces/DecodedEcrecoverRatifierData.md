[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / DecodedEcrecoverRatifierData

# Interface: DecodedEcrecoverRatifierData

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:166](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L166)

Decoded EcrecoverRatifier ratifier data.

Use this on the take-side or in diagnostics after `Payload.decode` when you
need to inspect the signature and proof attached to an Ecrecover offer.

## Example

```ts
import { EcrecoverRatifierUtils, type DecodedEcrecoverRatifierData } from "@morpho-org/midnight-sdk";
import { zeroHash } from "viem";

const data = EcrecoverRatifierUtils.encodeRatifierData({
  signature: { v: 27, r: zeroHash, s: zeroHash },
  root: zeroHash,
  leafIndex: 0n,
  proof: [],
});
const decoded: DecodedEcrecoverRatifierData =
  EcrecoverRatifierUtils.decodeRatifierData(data);
console.log(decoded.signature.v);
```

## Extends

- [`TreeProof`](TreeProof.md)

## Extended by

- [`VerifiedEcrecoverRatifierData`](VerifiedEcrecoverRatifierData.md)

## Properties

### leafIndex

> `readonly` **leafIndex**: `bigint`

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:181](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L181)

Leaf index in the tree.

#### Inherited from

[`TreeProof`](TreeProof.md).[`leafIndex`](TreeProof.md#leafindex)

***

### proof

> `readonly` **proof**: readonly `` `0x${string}` ``[]

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:183](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L183)

Sibling hashes from leaf to root.

#### Inherited from

[`TreeProof`](TreeProof.md).[`proof`](TreeProof.md#proof)

***

### root

> `readonly` **root**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:179](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L179)

Merkle root.

#### Inherited from

[`TreeProof`](TreeProof.md).[`root`](TreeProof.md#root)

***

### signature

> `readonly` **signature**: `Signature`\<`number`, `number`\> & `object`

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:168](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L168)

Ecrecover signature tuple decoded from ratifier data.

#### Type Declaration

##### v

> `readonly` **v**: `number`
