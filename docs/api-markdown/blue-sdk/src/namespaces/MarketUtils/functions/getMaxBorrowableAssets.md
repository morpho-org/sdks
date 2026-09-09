[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [MarketUtils](../README.md) / getMaxBorrowableAssets

# Function: getMaxBorrowableAssets()

> **getMaxBorrowableAssets**(`__namedParameters`, `market`, `marketParams`): `bigint` \| `undefined`

Defined in: [packages/blue-sdk/src/market/MarketUtils.ts:439](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketUtils.ts#L439)

Returns the maximum amount of loan assets that can be borrowed given a certain borrow position.
Return `undefined` iff the market's price is undefined.

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

### marketParams

#### lltv

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The market liquidation loan-to-value, scaled by WAD.

## Returns

`bigint` \| `undefined`

The additional borrowable loan assets, or `undefined` when price is unavailable.

## Example

```ts
import { MarketUtils, ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";

const borrowable = MarketUtils.getMaxBorrowableAssets(
  { collateral: 2n, borrowShares: 0n },
  { totalBorrowAssets: 0n, totalBorrowShares: 0n, price: ORACLE_PRICE_SCALE },
  { lltv: 50_0000000000000000n },
);
// borrowable satisfies bigint | undefined
```
