[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk-viem/src](../../../README.md) / [MetaMorphoAction](../README.md) / submitTimelock

# Function: submitTimelock()

> **submitTimelock**(`newTimelock`): `` `0x${string}` ``

Defined in: [packages/blue-sdk-viem/src/MetaMorphoAction.ts:137](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/MetaMorphoAction.ts#L137)

Encodes a call to a MetaMorpho vault to submit a new timelock.

## Parameters

### newTimelock

`bigint`

The new timelock (in seconds).

## Returns

`` `0x${string}` ``

ABI-encoded MetaMorpho calldata as a `MetaMorphoCall`.

## Example

```ts
import { MetaMorphoAction } from "@morpho-org/blue-sdk-viem";

const call = MetaMorphoAction.submitTimelock(86_400n);
```
