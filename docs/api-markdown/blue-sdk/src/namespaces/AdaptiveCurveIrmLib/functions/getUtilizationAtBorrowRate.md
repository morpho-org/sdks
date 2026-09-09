[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [AdaptiveCurveIrmLib](../README.md) / getUtilizationAtBorrowRate

# Function: getUtilizationAtBorrowRate()

> **getUtilizationAtBorrowRate**(`borrowRate`, `rateAtTarget`): `bigint`

Defined in: [packages/blue-sdk/src/math/AdaptiveCurveIrmLib.ts:209](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/math/AdaptiveCurveIrmLib.ts#L209)

Finds the utilization corresponding to a borrow rate and rate at target.

## Parameters

### borrowRate

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The borrow rate to invert, scaled by WAD.

### rateAtTarget

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The rate at target utilization, scaled by WAD.

## Returns

`bigint`

The utilization corresponding to `borrowRate`, scaled by WAD.

## Example

```ts
import { AdaptiveCurveIrmLib } from "@morpho-org/blue-sdk";

const utilization = AdaptiveCurveIrmLib.getUtilizationAtBorrowRate(
  AdaptiveCurveIrmLib.INITIAL_RATE_AT_TARGET,
  AdaptiveCurveIrmLib.INITIAL_RATE_AT_TARGET,
);
// utilization === AdaptiveCurveIrmLib.TARGET_UTILIZATION
```
