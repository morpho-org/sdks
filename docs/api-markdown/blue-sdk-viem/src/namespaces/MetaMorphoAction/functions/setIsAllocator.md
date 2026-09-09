[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk-viem/src](../../../README.md) / [MetaMorphoAction](../README.md) / setIsAllocator

# Function: setIsAllocator()

> **setIsAllocator**(`newAllocator`, `newIsAllocator`): `` `0x${string}` ``

Defined in: [packages/blue-sdk-viem/src/MetaMorphoAction.ts:52](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/MetaMorphoAction.ts#L52)

Encodes a call to a MetaMorpho vault to enable or disable an allocator.

## Parameters

### newAllocator

`` `0x${string}` ``

The address of the allocator.

### newIsAllocator

`boolean`

Whether the allocator should be enabled or disabled.

## Returns

`` `0x${string}` ``

ABI-encoded MetaMorpho calldata as a `MetaMorphoCall`.

## Example

```ts
import { MetaMorphoAction } from "@morpho-org/blue-sdk-viem";

const call = MetaMorphoAction.setIsAllocator(
  "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
  true,
);
```
