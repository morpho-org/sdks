[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [VaultUtils](../README.md) / toAssets

# Function: toAssets()

> **toAssets**(`shares`, `__namedParameters`, `rounding?`): `bigint`

Defined in: [packages/blue-sdk/src/vault/VaultUtils.ts:44](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultUtils.ts#L44)

Converts vault shares to underlying assets.

## Parameters

### shares

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The amount of vault shares.

### \_\_namedParameters

#### decimalsOffset

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

#### totalAssets

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

#### totalSupply

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

### rounding?

[`RoundingDirection`](../../../../../morpho-ts/src/type-aliases/RoundingDirection.md) = `"Down"`

Optional rounding direction. Defaults to `"Down"`.

## Returns

`bigint`

The equivalent amount of underlying assets.

## Example

```ts
import { VaultUtils } from "@morpho-org/blue-sdk";

const assets = VaultUtils.toAssets(100n, { totalAssets: 1_000n, totalSupply: 100n, decimalsOffset: 0n });
// assets satisfies bigint
```
