[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [MarketUtils](../README.md) / toSupplyShares

# Function: toSupplyShares()

> **toSupplyShares**(`assets`, `market`, `rounding?`): `bigint`

Defined in: [packages/blue-sdk/src/market/MarketUtils.ts:979](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/market/MarketUtils.ts#L979)

Converts market supply assets to supply shares.

## Parameters

### assets

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The supplied loan assets to convert.

### market

#### totalSupplyAssets

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The market's total supplied assets.

#### totalSupplyShares

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The market's total supply shares.

### rounding?

[`RoundingDirection`](../../../../../morpho-ts/src/type-aliases/RoundingDirection.md) = `"Up"`

Optional rounding direction. Defaults to `"Up"`.

## Returns

`bigint`

The equivalent amount of supply shares.

## Example

```ts
import { MarketUtils } from "@morpho-org/blue-sdk";

const shares = MarketUtils.toSupplyShares(100n, {
  totalSupplyAssets: 1_000n,
  totalSupplyShares: 100n,
});
// shares satisfies bigint
```
