[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [MarketUtils](../README.md) / getLtv

# Function: getLtv()

> **getLtv**(`__namedParameters`, `market`): `bigint` \| `null` \| `undefined`

Defined in: [packages/blue-sdk/src/market/MarketUtils.ts:861](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketUtils.ts#L861)

Returns the loan-to-value ratio of a given borrow position (scaled by WAD).
Returns `undefined` iff the market's price is undefined.
Returns null if the position is not a borrow.

## Parameters

### \_\_namedParameters

#### borrowShares

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

#### collateral

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

### market

#### price?

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The oracle price, scaled by `ORACLE_PRICE_SCALE`.

#### totalBorrowAssets

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The market's total borrowed assets.

#### totalBorrowShares

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The market's total borrow shares.

## Returns

`bigint` \| `null` \| `undefined`

The WAD-scaled loan-to-value ratio, `undefined`, or `null` when the position has no borrow.

## Example

```ts
import { MarketUtils, ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";

const ltv = MarketUtils.getLtv(
  { collateral: 2n, borrowShares: 1n },
  { totalBorrowAssets: 1n, totalBorrowShares: 1n, price: ORACLE_PRICE_SCALE },
);
// ltv satisfies bigint | null | undefined
```
