[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [MarketUtils](../README.md) / getPriceVariationToLiquidationPrice

# Function: getPriceVariationToLiquidationPrice()

> **getPriceVariationToLiquidationPrice**(`position`, `market`, `marketParams`): `bigint` \| `null` \| `undefined`

Defined in: [packages/blue-sdk/src/market/MarketUtils.ts:765](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketUtils.ts#L765)

Returns the price variation required for the given position to reach its liquidation threshold (scaled by WAD).
Negative when healthy (the price needs to drop x%), positive when unhealthy (the price needs to soar x%).
Returns `undefined` iff the market's price is undefined.
Returns null if the position is not a borrow.

## Parameters

### position

The borrow position to evaluate.

#### borrowShares

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

#### collateral

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

### market

The market state used to value the position.

#### price?

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

#### totalBorrowAssets

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

#### totalBorrowShares

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

### marketParams

The market params containing LLTV.

#### lltv

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

## Returns

`bigint` \| `null` \| `undefined`

The WAD-scaled price variation, `undefined`, or `null` when the position has no borrow.

## Example

```ts
import { MarketUtils, ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";

const variation = MarketUtils.getPriceVariationToLiquidationPrice(
  { collateral: 2n, borrowShares: 1n },
  { totalBorrowAssets: 1n, totalBorrowShares: 1n, price: ORACLE_PRICE_SCALE },
  { lltv: 50_0000000000000000n },
);
// variation satisfies bigint | null | undefined
```
