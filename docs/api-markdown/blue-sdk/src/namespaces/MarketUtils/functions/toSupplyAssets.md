[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [MarketUtils](../README.md) / toSupplyAssets

# Function: toSupplyAssets()

> **toSupplyAssets**(`shares`, `market`, `rounding?`): `bigint`

Defined in: [packages/blue-sdk/src/market/MarketUtils.ts:943](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketUtils.ts#L943)

Converts market supply shares to loan assets.

## Parameters

### shares

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The supply shares to convert.

### market

#### totalSupplyAssets

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The market's total supplied assets.

#### totalSupplyShares

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The market's total supply shares.

### rounding?

[`RoundingDirection`](../../../../../morpho-ts/src/type-aliases/RoundingDirection.md) = `"Down"`

Optional rounding direction. Defaults to `"Down"`.

## Returns

`bigint`

The equivalent amount of supplied loan assets.

## Example

```ts
import { MarketUtils } from "@morpho-org/blue-sdk";

const assets = MarketUtils.toSupplyAssets(100n, {
  totalSupplyAssets: 1_000n,
  totalSupplyShares: 100n,
});
// assets satisfies bigint
```
