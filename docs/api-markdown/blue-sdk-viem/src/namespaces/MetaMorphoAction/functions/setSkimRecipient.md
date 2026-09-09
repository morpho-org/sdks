[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [blue-sdk-viem/src](../../../README.md) / [MetaMorphoAction](../README.md) / setSkimRecipient

# Function: setSkimRecipient()

> **setSkimRecipient**(`newSkimRecipient`): `` `0x${string}` ``

Defined in: [packages/blue-sdk-viem/src/MetaMorphoAction.ts:97](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/MetaMorphoAction.ts#L97)

Encode a call to a MetaMorpho vault to set the skim recipient.

## Parameters

### newSkimRecipient

`` `0x${string}` ``

The address of the new skim recipient.

## Returns

`` `0x${string}` ``

ABI-encoded MetaMorpho calldata as a `MetaMorphoCall`.

## Example

```ts
import { MetaMorphoAction } from "@morpho-org/blue-sdk-viem";

const call = MetaMorphoAction.setSkimRecipient(
  "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
);
```
