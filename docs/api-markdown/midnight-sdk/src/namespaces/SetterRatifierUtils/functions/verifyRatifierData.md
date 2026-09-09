[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [SetterRatifierUtils](../README.md) / verifyRatifierData

# Function: verifyRatifierData()

> **verifyRatifierData**(`params`): [`TreeProof`](../../../interfaces/TreeProof.md)

Defined in: [packages/midnight-sdk/src/signatures/SetterRatifierUtils.ts:213](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/SetterRatifierUtils.ts#L213)

Verifies that Setter ratifier data proves one payload offer belongs to its root.

This helper intentionally does not check `SetterRatifier.isRootRatified` or
`Midnight.isAuthorized` state. Consumers can query those values at their
own block context after local proof verification.

## Parameters

### params

[`SetterRatifierDataVerificationParams`](../../../interfaces/SetterRatifierDataVerificationParams.md)

## Returns

[`TreeProof`](../../../interfaces/TreeProof.md)

Decoded Setter ratifier data after proof verification.

## Throws

when the proof does not include `offer` in `root`.

## Example

```ts
import { SetterRatifierUtils } from "@morpho-org/midnight-sdk";

const decoded = SetterRatifierUtils.verifyRatifierData({
  offer,
  ratifierData,
});
console.log(decoded.root);
```
