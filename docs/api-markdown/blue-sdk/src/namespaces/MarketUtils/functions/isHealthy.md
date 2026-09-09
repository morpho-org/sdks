[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [MarketUtils](../README.md) / isHealthy

# Function: isHealthy()

> **isHealthy**(`position`, `market`, `marketParams`): `boolean` \| `undefined`

Defined in: [packages/blue-sdk/src/market/MarketUtils.ts:673](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketUtils.ts#L673)

Returns whether a given borrow position is healthy.
Return `undefined` iff the market's price is undefined.

## Parameters

### position

The borrow position to check.

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

`boolean` \| `undefined`

Whether the position is healthy, or `undefined` when price is unavailable.

## Example

```ts
import { MarketUtils, ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";

const healthy = MarketUtils.isHealthy(
  { collateral: 2n, borrowShares: 0n },
  { totalBorrowAssets: 0n, totalBorrowShares: 0n, price: ORACLE_PRICE_SCALE },
  { lltv: 50_0000000000000000n },
);
// healthy satisfies boolean | undefined
```
