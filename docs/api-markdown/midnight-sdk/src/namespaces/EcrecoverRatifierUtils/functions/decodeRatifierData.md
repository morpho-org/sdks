[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [EcrecoverRatifierUtils](../README.md) / decodeRatifierData

# Function: decodeRatifierData()

> **decodeRatifierData**(`data`): [`DecodedEcrecoverRatifierData`](../../../interfaces/DecodedEcrecoverRatifierData.md)

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:1037](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L1037)

Decodes EcrecoverRatifier ratifier data.

Use on the take-side or in tests after `Payload.decode` to inspect the
proof/signature attached to a published offer.

## Parameters

### data

`` `0x${string}` ``

ABI-encoded ratifier data.

## Returns

[`DecodedEcrecoverRatifierData`](../../../interfaces/DecodedEcrecoverRatifierData.md)

Decoded Ecrecover ratifier data.

## Example

```ts
import { EcrecoverRatifierUtils } from "@morpho-org/midnight-sdk";
import { zeroHash } from "viem";

const data = EcrecoverRatifierUtils.encodeRatifierData({
  signature: { v: 27, r: zeroHash, s: zeroHash },
  root: zeroHash,
  leafIndex: 0n,
  proof: [],
});
const decoded = EcrecoverRatifierUtils.decodeRatifierData(data);
console.log(decoded.leafIndex);
```
