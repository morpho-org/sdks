[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk-viem/src](../../../README.md) / [MetaMorphoAction](../README.md) / updateWithdrawQueue

# Function: updateWithdrawQueue()

> **updateWithdrawQueue**(`indexes`): `` `0x${string}` ``

Defined in: [packages/blue-sdk-viem/src/MetaMorphoAction.ts:434](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/MetaMorphoAction.ts#L434)

Encodes a call to a MetaMorpho vault to update the withdraw queue.

## Parameters

### indexes

`bigint`[]

The indexes of each market in the previous withdraw queue, in the new withdraw queue's order.

## Returns

`` `0x${string}` ``

ABI-encoded MetaMorpho calldata as a `MetaMorphoCall`.

## Example

```ts
import { MetaMorphoAction } from "@morpho-org/blue-sdk-viem";

const call = MetaMorphoAction.updateWithdrawQueue([0n, 1n]);
```
