[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [SharesMath](../README.md) / toAssets

# Function: toAssets()

> **toAssets**(`shares`, `totalAssets`, `totalShares`, `rounding`): `bigint`

Defined in: [packages/blue-sdk/src/math/SharesMath.ts:32](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/math/SharesMath.ts#L32)

Converts shares to assets using Morpho virtual shares and assets.

## Parameters

### shares

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The amount of shares.

### totalAssets

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The total assets before conversion.

### totalShares

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The total shares before conversion.

### rounding

[`RoundingDirection`](../../../../../morpho-ts/src/type-aliases/RoundingDirection.md)

The rounding direction.

## Returns

`bigint`

The equivalent amount of assets.

## Example

```ts
import { SharesMath } from "@morpho-org/blue-sdk";

const assets = SharesMath.toAssets(100n, 1_000n, 100n, "Down");
// assets satisfies bigint
```
