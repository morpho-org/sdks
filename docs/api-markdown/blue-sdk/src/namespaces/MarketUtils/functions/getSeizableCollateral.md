[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [MarketUtils](../README.md) / getSeizableCollateral

# Function: getSeizableCollateral()

> **getSeizableCollateral**(`position`, `market`, `config`): `bigint` \| `undefined`

Defined in: [packages/blue-sdk/src/market/MarketUtils.ts:579](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketUtils.ts#L579)

Returns the maximum amount of collateral that is worth being seized in a liquidation given a certain borrow position.
Return `undefined` iff the market's price is undefined.

## Parameters

### position

#### borrowShares

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The borrow shares in the position.

#### collateral

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The collateral amount in the position.

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

The maximum seizable collateral, or `undefined` when price is unavailable.

## Example

```ts
import { MarketUtils, ORACLE_PRICE_SCALE } from "@morpho-org/blue-sdk";

const collateral = MarketUtils.getSeizableCollateral(
  { collateral: 1n, borrowShares: 1n },
  { totalBorrowAssets: 1n, totalBorrowShares: 1n, price: ORACLE_PRICE_SCALE },
  { lltv: 50_0000000000000000n },
);
// collateral satisfies bigint | undefined
```
