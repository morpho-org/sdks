[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk/src](../../../README.md) / [VaultUtils](../README.md) / decimalsOffset

# Function: decimalsOffset()

> **decimalsOffset**(`decimals`): `bigint`

Defined in: [packages/blue-sdk/src/vault/VaultUtils.ts:22](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/vault/VaultUtils.ts#L22)

Returns the decimals offset between 18-decimal vault shares and an asset.

## Parameters

### decimals

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

The asset decimals.

## Returns

`bigint`

The non-negative decimals offset.

## Example

```ts
import { VaultUtils } from "@morpho-org/blue-sdk";

const offset = VaultUtils.decimalsOffset(6n);
// offset === 12n
```
