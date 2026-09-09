[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [MarketUtils](../README.md) / toBorrowShares

# Function: toBorrowShares()

> **toBorrowShares**(`assets`, `market`, `rounding?`): `bigint`

Defined in: [packages/blue-sdk/src/market/MarketUtils.ts:1051](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketUtils.ts#L1051)

Converts market borrow assets to borrow shares.

## Parameters

### assets

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The borrowed loan assets to convert.

### market

#### totalBorrowAssets

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The market's total borrowed assets.

#### totalBorrowShares

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The market's total borrow shares.

### rounding?

[`RoundingDirection`](../../../../../morpho-ts/src/type-aliases/RoundingDirection.md) = `"Down"`

Optional rounding direction. Defaults to `"Down"`.

## Returns

`bigint`

The equivalent amount of borrow shares.

## Example

```ts
import { MarketUtils } from "@morpho-org/blue-sdk";

const shares = MarketUtils.toBorrowShares(100n, {
  totalBorrowAssets: 1_000n,
  totalBorrowShares: 100n,
});
// shares satisfies bigint
```
