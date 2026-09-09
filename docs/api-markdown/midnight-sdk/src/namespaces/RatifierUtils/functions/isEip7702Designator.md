[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [RatifierUtils](../README.md) / isEip7702Designator

# Function: isEip7702Designator()

> **isEip7702Designator**(`bytecode`): `boolean`

Defined in: [packages/midnight-sdk/src/signatures/RatifierUtils.ts:211](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/RatifierUtils.ts#L211)

Checks whether bytecode is an EIP-7702 designator.

EIP-7702 accounts have code-like bytecode but still sign as the owning EOA,
so they use the Ecrecover ratifier route instead of the Setter route.

## Parameters

### bytecode

`` `0x${string}` ``

Account bytecode.

## Returns

`boolean`

Whether the bytecode starts with `0xef0100`.

## Example

```ts
import { RatifierUtils } from "@morpho-org/midnight-sdk";

console.log(RatifierUtils.isEip7702Designator("0xef0100"));
```
