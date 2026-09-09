[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [SharesMath](../README.md) / toShares

# Function: toShares()

> **toShares**(`assets`, `totalAssets`, `totalShares`, `rounding`): `bigint`

Defined in: [packages/blue-sdk/src/math/SharesMath.ts:63](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/math/SharesMath.ts#L63)

Converts assets to shares using Morpho virtual shares and assets.

## Parameters

### assets

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The amount of assets.

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

The equivalent amount of shares.

## Example

```ts
import { SharesMath } from "@morpho-org/blue-sdk";

const shares = SharesMath.toShares(100n, 1_000n, 100n, "Up");
// shares satisfies bigint
```
