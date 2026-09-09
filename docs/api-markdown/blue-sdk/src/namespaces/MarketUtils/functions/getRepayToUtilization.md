[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [MarketUtils](../README.md) / getRepayToUtilization

# Function: getRepayToUtilization()

> **getRepayToUtilization**(`market`, `utilization`): `bigint`

Defined in: [packages/blue-sdk/src/market/MarketUtils.ts:321](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketUtils.ts#L321)

Returns the smallest volume to repay until the market gets the closest to the given utilization rate.

## Parameters

### market

The market state.

#### totalBorrowAssets

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

#### totalSupplyAssets

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

### utilization

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The target utilization rate (scaled by WAD).

## Returns

`bigint`

The amount to repay before reaching the target utilization.

## Example

```ts
import { MarketUtils, MathLib } from "@morpho-org/blue-sdk";

const assets = MarketUtils.getRepayToUtilization(
  { totalSupplyAssets: 100n, totalBorrowAssets: 80n },
  MathLib.WAD / 2n,
);
// assets satisfies bigint
```
