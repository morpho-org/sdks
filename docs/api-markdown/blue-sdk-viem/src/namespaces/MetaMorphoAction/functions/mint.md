[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk-viem/src](../../../README.md) / [MetaMorphoAction](../README.md) / mint

# Function: mint()

> **mint**(`shares`, `receiver`): `` `0x${string}` ``

Defined in: [packages/blue-sdk-viem/src/MetaMorphoAction.ts:488](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/MetaMorphoAction.ts#L488)

Encodes a call to a MetaMorpho vault to mint shares.

## Parameters

### shares

`bigint`

The amount of shares to mint.

### receiver

`` `0x${string}` ``

The address of the receiver of the shares.

## Returns

`` `0x${string}` ``

ABI-encoded MetaMorpho calldata as a `MetaMorphoCall`.

## Example

```ts
import { MetaMorphoAction } from "@morpho-org/blue-sdk-viem";

const call = MetaMorphoAction.mint(
  1_000_000n,
  "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
);
```
