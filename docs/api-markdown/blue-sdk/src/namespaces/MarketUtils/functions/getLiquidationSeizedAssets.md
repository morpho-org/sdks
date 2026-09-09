[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [MarketUtils](../README.md) / getLiquidationSeizedAssets

# Function: getLiquidationSeizedAssets()

> **getLiquidationSeizedAssets**(`repaidShares`, `market`, `config`): `bigint` \| `undefined`

Defined in: [packages/blue-sdk/src/market/MarketUtils.ts:487](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketUtils.ts#L487)

Returns the amount of collateral that would be seized in a liquidation given a certain amount of repaid shares.
Return `undefined` iff the market's price is undefined.

## Parameters

### repaidShares

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The borrow shares repaid by the liquidation.

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

### config

#### lltv

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The market liquidation loan-to-value, scaled by WAD.

## Returns

`bigint` \| `undefined`

The seized collateral amount, or `undefined` when price is unavailable.

## Example

```ts
import { MarketUtils, ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";

const seized = MarketUtils.getLiquidationSeizedAssets(
  1n,
  { totalBorrowAssets: 1n, totalBorrowShares: 1n, price: ORACLE_PRICE_SCALE },
  { lltv: 86_0000000000000000n },
);
// seized satisfies bigint | undefined
```
