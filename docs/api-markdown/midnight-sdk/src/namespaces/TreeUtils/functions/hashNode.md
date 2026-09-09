[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [TreeUtils](../README.md) / hashNode

# Function: hashNode()

> **hashNode**(`left`, `right`): `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:641](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L641)

Computes HashLib node hash from left and right child hashes.

## Parameters

### left

`` `0x${string}` ``

Left child hash.

### right

`` `0x${string}` ``

Right child hash.

## Returns

`` `0x${string}` ``

Node hash.

## Example

```ts
import { TreeUtils } from "@morpho-org/midnight-sdk";

const root = TreeUtils.hashNode(
  "0x0000000000000000000000000000000000000000000000000000000000000000",
  "0x0000000000000000000000000000000000000000000000000000000000000000",
);
console.log(root);
```
