[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [MarketUtils](../README.md) / getBorrowToUtilization

# Function: getBorrowToUtilization()

> **getBorrowToUtilization**(`market`, `utilization`): `bigint`

Defined in: [packages/blue-sdk/src/market/MarketUtils.ts:289](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketUtils.ts#L289)

Returns the liquidity available to borrow until the market gets the closest to the given utilization rate.

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

The amount borrowable before reaching the target utilization.

## Example

```ts
import { MarketUtils, MathLib } from "@morpho-org/blue-sdk";

const assets = MarketUtils.getBorrowToUtilization(
  { totalSupplyAssets: 100n, totalBorrowAssets: 50n },
  MathLib.WAD,
);
// assets satisfies bigint
```
