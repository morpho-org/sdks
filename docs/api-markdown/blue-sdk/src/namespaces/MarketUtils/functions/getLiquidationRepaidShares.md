[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [MarketUtils](../README.md) / getLiquidationRepaidShares

# Function: getLiquidationRepaidShares()

> **getLiquidationRepaidShares**(`seizedAssets`, `market`, `config`): `bigint` \| `undefined`

Defined in: [packages/blue-sdk/src/market/MarketUtils.ts:534](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketUtils.ts#L534)

Returns the amount of borrow shares that would be repaid in a liquidation given a certain amount of seized collateral.
Return `undefined` iff the market's price is undefined.

## Parameters

### seizedAssets

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The collateral amount seized by the liquidation.

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

The borrow shares repaid, or `undefined` when price is unavailable.

## Example

```ts
import { MarketUtils, ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";

const shares = MarketUtils.getLiquidationRepaidShares(
  1n,
  { totalBorrowAssets: 1n, totalBorrowShares: 1n, price: ORACLE_PRICE_SCALE },
  { lltv: 86_0000000000000000n },
);
// shares satisfies bigint | undefined
```
