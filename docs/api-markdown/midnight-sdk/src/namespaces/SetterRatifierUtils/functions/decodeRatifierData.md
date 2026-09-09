[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [SetterRatifierUtils](../README.md) / decodeRatifierData

# Function: decodeRatifierData()

> **decodeRatifierData**(`data`): [`TreeProof`](../../../interfaces/TreeProof.md)

Defined in: [packages/midnight-sdk/src/signatures/SetterRatifierUtils.ts:182](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/SetterRatifierUtils.ts#L182)

Decodes SetterRatifier ratifier data.

Use on the take-side or in tests after `Payload.decode` to inspect the
proof attached to a published Setter offer.

## Parameters

### data

`` `0x${string}` ``

ABI-encoded ratifier data.

## Returns

[`TreeProof`](../../../interfaces/TreeProof.md)

Decoded Setter ratifier data.

## Example

```ts
import { SetterRatifierUtils } from "@morpho-org/midnight-sdk";
import { zeroHash } from "viem";

const data = SetterRatifierUtils.encodeRatifierData({
  root: zeroHash,
  leafIndex: 0n,
  proof: [],
});
const decoded = SetterRatifierUtils.decodeRatifierData(data);
console.log(decoded.proof);
```
