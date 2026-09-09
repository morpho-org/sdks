[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [MarketUtils](../README.md) / getLiquidationPrice

# Function: getLiquidationPrice()

> **getLiquidationPrice**(`__namedParameters`, `market`, `marketParams`): `bigint` \| `null`

Defined in: [packages/blue-sdk/src/market/MarketUtils.ts:719](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketUtils.ts#L719)

Returns the price of the collateral quoted in the loan token (e.g. ETH/DAI)
that set the user's position to be liquidatable.
Returns null if the position is not a borrow.

## Parameters

### \_\_namedParameters

#### borrowShares

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

#### collateral

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

### market

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

`bigint` \| `null`

The liquidation price, or `null` when the position has no borrow.

## Example

```ts
import { MarketUtils } from "@morpho-org/blue-sdk";

const price = MarketUtils.getLiquidationPrice(
  { collateral: 2n, borrowShares: 1n },
  { totalBorrowAssets: 1n, totalBorrowShares: 1n },
  { lltv: 50_0000000000000000n },
);
// price satisfies bigint | null
```
