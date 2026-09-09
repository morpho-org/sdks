[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / DecodedSetterRatifierData

# Type Alias: DecodedSetterRatifierData

> **DecodedSetterRatifierData** = [`TreeProof`](../interfaces/TreeProof.md)

Defined in: [packages/midnight-sdk/src/signatures/SetterRatifierUtils.ts:45](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/SetterRatifierUtils.ts#L45)

Decoded SetterRatifier ratifier data.

Use this on the take-side or in diagnostics after `Payload.decode` when you
need to inspect the proof attached to a Setter-ratified offer.

## Example

```ts
import { SetterRatifierUtils, type DecodedSetterRatifierData } from "@morpho-org/midnight-sdk";
import { zeroHash } from "viem";

const data = SetterRatifierUtils.encodeRatifierData({
  root: zeroHash,
  leafIndex: 0n,
  proof: [],
});
const decoded: DecodedSetterRatifierData =
  SetterRatifierUtils.decodeRatifierData(data);
console.log(decoded.root);
```
