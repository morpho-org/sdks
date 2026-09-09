[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [VaultUtils](../README.md) / toShares

# Function: toShares()

> **toShares**(`assets`, `__namedParameters`, `rounding?`): `bigint`

Defined in: [packages/blue-sdk/src/vault/VaultUtils.ts:84](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultUtils.ts#L84)

Converts underlying assets to vault shares.

## Parameters

### assets

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The amount of underlying assets.

### \_\_namedParameters

#### decimalsOffset

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

#### totalAssets

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

#### totalSupply

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

### rounding?

[`RoundingDirection`](../../../../../morpho-ts/src/type-aliases/RoundingDirection.md) = `"Up"`

Optional rounding direction. Defaults to `"Up"`.

## Returns

`bigint`

The equivalent amount of vault shares.

## Example

```ts
import { VaultUtils } from "@morpho-org/blue-sdk";

const shares = VaultUtils.toShares(100n, { totalAssets: 1_000n, totalSupply: 100n, decimalsOffset: 0n });
// shares satisfies bigint
```
