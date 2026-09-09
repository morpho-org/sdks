[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [AdaptiveCurveIrmLib](../README.md) / wExp

# Function: wExp()

> **wExp**(`x`): `bigint`

Defined in: [packages/blue-sdk/src/math/AdaptiveCurveIrmLib.ts:57](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/math/AdaptiveCurveIrmLib.ts#L57)

Returns an approximation of exp(x) used by the Adaptive Curve IRM.

## Parameters

### x

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The WAD-scaled exponent.

## Returns

`bigint`

The WAD-scaled exponential approximation.

## Example

```ts
import { AdaptiveCurveIrmLib } from "@morpho-org/blue-sdk";

const value = AdaptiveCurveIrmLib.wExp(0n);
// value === 1000000000000000000n
```
