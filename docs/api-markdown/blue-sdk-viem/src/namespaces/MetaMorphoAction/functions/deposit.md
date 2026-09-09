[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk-viem/src](../../../README.md) / [MetaMorphoAction](../README.md) / deposit

# Function: deposit()

> **deposit**(`assets`, `receiver`): `` `0x${string}` ``

Defined in: [packages/blue-sdk-viem/src/MetaMorphoAction.ts:511](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/MetaMorphoAction.ts#L511)

Encodes a call to a MetaMorpho vault to deposit assets.

## Parameters

### assets

`bigint`

The amount of assets to deposit.

### receiver

`` `0x${string}` ``

The address of the receiver of the shares.

## Returns

`` `0x${string}` ``

ABI-encoded MetaMorpho calldata as a `MetaMorphoCall`.

## Example

```ts
import { MetaMorphoAction } from "@morpho-org/blue-sdk-viem";

const call = MetaMorphoAction.deposit(
  1_000_000n,
  "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
);
```
