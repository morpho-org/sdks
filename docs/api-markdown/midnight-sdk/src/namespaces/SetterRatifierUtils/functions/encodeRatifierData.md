[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [SetterRatifierUtils](../README.md) / encodeRatifierData

# Function: encodeRatifierData()

> **encodeRatifierData**(`params`): `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/signatures/SetterRatifierUtils.ts:148](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/SetterRatifierUtils.ts#L148)

Encodes SetterRatifier ratifier data.

Use only when you already have a root and proof. Most maker flows call
`ratifierData` for one leaf or `ratify` for every leaf in the approved
tree.

## Parameters

### params

#### leafIndex

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

Leaf index proven by `params.proof`.

#### proof

readonly `` `0x${string}` ``[]

Merkle proof siblings for the leaf.

#### root

`` `0x${string}` ``

Merkle root approved by the maker's Setter ratifier.

## Returns

`` `0x${string}` ``

ABI-encoded ratifier data.

## Example

```ts
import { SetterRatifierUtils } from "@morpho-org/midnight-sdk";

const data = SetterRatifierUtils.encodeRatifierData({
  root: "0x0000000000000000000000000000000000000000000000000000000000000000",
  leafIndex: 0n,
  proof: [],
});
console.log(data);
```
