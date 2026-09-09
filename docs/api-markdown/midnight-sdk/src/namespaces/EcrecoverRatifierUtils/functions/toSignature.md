[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [EcrecoverRatifierUtils](../README.md) / toSignature

# Function: toSignature()

> **toSignature**(`signature`): `Signature`\<`number`, `number`\> & `object`

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:944](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L944)

Converts a hex ECDSA signature into the Solidity tuple shape.

## Parameters

### signature

[`EcrecoverSignatureInput`](../../../type-aliases/EcrecoverSignatureInput.md)

Hex string or tuple signature.

## Returns

`Signature`\<`number`, `number`\> & `object`

Signature tuple.

## Example

```ts
import { EcrecoverRatifierUtils } from "@morpho-org/midnight-sdk";
import { zeroHash } from "viem";

const signature = EcrecoverRatifierUtils.toSignature({
  v: 27,
  r: zeroHash,
  s: zeroHash,
});
console.log(signature.v);
```
