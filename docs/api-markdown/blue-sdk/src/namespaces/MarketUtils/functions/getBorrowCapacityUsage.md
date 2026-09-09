[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [MarketUtils](../README.md) / getBorrowCapacityUsage

# Function: getBorrowCapacityUsage()

> **getBorrowCapacityUsage**(`position`, `market`, `marketParams`): `bigint` \| `undefined`

Defined in: [packages/blue-sdk/src/market/MarketUtils.ts:907](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketUtils.ts#L907)

Returns the usage ratio of the maximum borrow capacity given a certain borrow position (scaled by WAD).
Returns `undefined` iff the market's price is undefined.

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

`bigint` \| `undefined`

The WAD-scaled borrow capacity usage, or `undefined` when price is unavailable.

## Example

```ts
import { MarketUtils, ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";

const usage = MarketUtils.getBorrowCapacityUsage(
  { collateral: 2n, borrowShares: 1n },
  { totalBorrowAssets: 1n, totalBorrowShares: 1n, price: ORACLE_PRICE_SCALE },
  { lltv: 50_0000000000000000n },
);
// usage satisfies bigint | undefined
```
