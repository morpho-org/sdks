[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk/src](../README.md) / getDefaultPreLiquidationParams

# Function: getDefaultPreLiquidationParams()

> **getDefaultPreLiquidationParams**(`lltv`): `object`

Defined in: [packages/blue-sdk/src/preLiquidation.ts:104](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk/src/preLiquidation.ts#L104)

Returns default PreLiquidation params for a supported Morpho Blue LLTV.

## Parameters

### lltv

[`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

The Morpho Blue liquidation loan-to-value, scaled by WAD.

## Returns

`object`

The default PreLiquidation parameter set for `lltv`.

### preLCF1

> **preLCF1**: `bigint` = `22637943984157107n`

### preLCF2

> **preLCF2**: `bigint` = `34_9673199983645648n`

### preLIF1

> **preLIF1**: `bigint`

### preLIF2

> **preLIF2**: `bigint`

### preLltv

> **preLltv**: `bigint` = `30_1514568055515563n`

## Throws

when no default parameters exist for `lltv`.

## Example

```ts
import { getDefaultPreLiquidationParams } from "@morpho-org/blue-sdk";
import { parseEther } from "viem";

const params = getDefaultPreLiquidationParams(parseEther("0.86"));
// params satisfies { preLltv: bigint; preLCF1: bigint; preLCF2: bigint; preLIF1: bigint; preLIF2: bigint }
```
