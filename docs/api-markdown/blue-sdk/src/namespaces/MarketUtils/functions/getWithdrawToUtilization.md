[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [MarketUtils](../README.md) / getWithdrawToUtilization

# Function: getWithdrawToUtilization()

> **getWithdrawToUtilization**(`market`, `utilization`): `bigint`

Defined in: [packages/blue-sdk/src/market/MarketUtils.ts:247](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketUtils.ts#L247)

Returns the liquidity available to withdraw until the market gets the closest to the given utilization rate.

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

The amount withdrawable before reaching the target utilization.

## Example

```ts
import { MarketUtils, MathLib } from "@morpho-org/blue-sdk";

const assets = MarketUtils.getWithdrawToUtilization(
  { totalSupplyAssets: 100n, totalBorrowAssets: 50n },
  MathLib.WAD,
);
// assets satisfies bigint
```
