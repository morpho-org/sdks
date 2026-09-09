[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [MarketUtils](../README.md) / getMaxBorrowAssets

# Function: getMaxBorrowAssets()

> **getMaxBorrowAssets**(`collateral`, `market`, `__namedParameters`): `bigint` \| `undefined`

Defined in: [packages/blue-sdk/src/market/MarketUtils.ts:404](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketUtils.ts#L404)

Returns the maximum debt allowed given a certain amount of collateral.
Return `undefined` iff the market's price is undefined.
To calculate the amount of loan assets that can be borrowed, use `getMaxBorrowableAssets`.

## Parameters

### collateral

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The collateral amount.

### market

#### price?

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The oracle price, scaled by `ORACLE_PRICE_SCALE`.

### \_\_namedParameters

#### lltv

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

## Returns

`bigint` \| `undefined`

The maximum borrow assets allowed, or `undefined` when price is unavailable.

## Example

```ts
import { MarketUtils, ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";

const maxBorrow = MarketUtils.getMaxBorrowAssets(
  2n,
  { price: ORACLE_PRICE_SCALE },
  { lltv: 50_0000000000000000n },
);
// maxBorrow === 1n
```
