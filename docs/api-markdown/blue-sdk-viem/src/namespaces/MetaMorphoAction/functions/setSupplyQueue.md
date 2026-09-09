[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk-viem/src](../../../README.md) / [MetaMorphoAction](../README.md) / setSupplyQueue

# Function: setSupplyQueue()

> **setSupplyQueue**(`supplyQueue`): `` `0x${string}` ``

Defined in: [packages/blue-sdk-viem/src/MetaMorphoAction.ts:415](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/MetaMorphoAction.ts#L415)

Encodes a call to a MetaMorpho vault to set the supply queue.

## Parameters

### supplyQueue

[`MarketId`](../../../../../blue-sdk/src/type-aliases/MarketId.md)[]

The new supply queue.

## Returns

`` `0x${string}` ``

ABI-encoded MetaMorpho calldata as a `MetaMorphoCall`.

## Example

```ts
import type { MarketId } from "@morpho-org/blue-sdk";
import { MetaMorphoAction } from "@morpho-org/blue-sdk-viem";

const marketId =
  "0xdba352c33d64fc9bff091d505dbfcbc6c41b89986c2193b22a90031e9dac7f76" as MarketId;

const call = MetaMorphoAction.setSupplyQueue([marketId]);
```
