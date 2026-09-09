[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [AdaptiveCurveIrmLib](../README.md) / getBorrowRate

# Function: getBorrowRate()

> **getBorrowRate**(`startUtilization`, `startRateAtTarget`, `elapsed`): `object`

Defined in: [packages/blue-sdk/src/math/AdaptiveCurveIrmLib.ts:100](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/math/AdaptiveCurveIrmLib.ts#L100)

Computes Adaptive Curve IRM borrow rates from utilization and elapsed time.

## Parameters

### startUtilization

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The market utilization at the start of the period, scaled by WAD.

### startRateAtTarget

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The rate at target utilization at the start of the period, scaled by WAD.

### elapsed

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The elapsed time in seconds.

## Returns

`object`

The average borrow rate, end borrow rate, and end rate at target, all scaled by WAD.

### avgBorrowRate

> **avgBorrowRate**: `bigint`

### endBorrowRate

> **endBorrowRate**: `bigint`

### endRateAtTarget

> **endRateAtTarget**: `bigint`

## Example

```ts
import { AdaptiveCurveIrmLib } from "@morpho-org/blue-sdk";

const rates = AdaptiveCurveIrmLib.getBorrowRate(
  AdaptiveCurveIrmLib.TARGET_UTILIZATION,
  AdaptiveCurveIrmLib.INITIAL_RATE_AT_TARGET,
  12n,
);
// rates satisfies { avgBorrowRate: bigint; endBorrowRate: bigint; endRateAtTarget: bigint }
```
