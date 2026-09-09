[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [MarketUtils](../README.md) / getUtilization

# Function: getUtilization()

> **getUtilization**(`market`): `bigint`

Defined in: [packages/blue-sdk/src/market/MarketUtils.ts:95](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketUtils.ts#L95)

Returns the market's utilization rate (scaled by WAD).

## Parameters

### market

The market state.

#### totalBorrowAssets

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

#### totalSupplyAssets

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

## Returns

`bigint`

The market utilization rate, scaled by WAD.

## Example

```ts
import { MarketUtils } from "@morpho-org/blue-sdk";

const utilization = MarketUtils.getUtilization({
  totalSupplyAssets: 100n,
  totalBorrowAssets: 50n,
});
// utilization === 500000000000000000n
```
