[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk-viem/src](../../../README.md) / [MetaMorphoAction](../README.md) / withdraw

# Function: withdraw()

> **withdraw**(`assets`, `receiver`, `owner`): `` `0x${string}` ``

Defined in: [packages/blue-sdk-viem/src/MetaMorphoAction.ts:534](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/MetaMorphoAction.ts#L534)

Encodes a call to a MetaMorpho vault to withdraw assets.

## Parameters

### assets

`bigint`

The amount of assets to withdraw.

### receiver

`` `0x${string}` ``

The address of the receiver of the assets.

### owner

`` `0x${string}` ``

The address of the owner of the shares to redeem.

## Returns

`` `0x${string}` ``

ABI-encoded MetaMorpho calldata as a `MetaMorphoCall`.

## Example

```ts
import { MetaMorphoAction } from "@morpho-org/blue-sdk-viem";

const receiver = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
const call = MetaMorphoAction.withdraw(1_000_000n, receiver, receiver);
```
