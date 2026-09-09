[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [MarketUtils](../README.md) / toBorrowAssets

# Function: toBorrowAssets()

> **toBorrowAssets**(`shares`, `market`, `rounding?`): `bigint`

Defined in: [packages/blue-sdk/src/market/MarketUtils.ts:1015](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketUtils.ts#L1015)

Converts market borrow shares to loan assets.

## Parameters

### shares

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The borrow shares to convert.

### market

#### totalBorrowAssets

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The market's total borrowed assets.

#### totalBorrowShares

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The market's total borrow shares.

### rounding?

[`RoundingDirection`](../../../../../morpho-ts/src/type-aliases/RoundingDirection.md) = `"Up"`

Optional rounding direction. Defaults to `"Up"`.

## Returns

`bigint`

The equivalent amount of borrowed loan assets.

## Example

```ts
import { MarketUtils } from "@morpho-org/blue-sdk";

const assets = MarketUtils.toBorrowAssets(100n, {
  totalBorrowAssets: 1_000n,
  totalBorrowShares: 100n,
});
// assets satisfies bigint
```
