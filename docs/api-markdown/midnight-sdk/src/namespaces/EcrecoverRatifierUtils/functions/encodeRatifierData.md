[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [EcrecoverRatifierUtils](../README.md) / encodeRatifierData

# Function: encodeRatifierData()

> **encodeRatifierData**(`params`): `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:994](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L994)

Encodes EcrecoverRatifier ratifier data.

Use only when you already have a signature and proof. Most maker flows call
`ratifierData` for one leaf or `ratify` for every leaf in the tree.

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

Merkle root approved by the signature.

#### signature

\{ `r`: `` `0x${string}` ``; `s`: `` `0x${string}` ``; `v`: `bigint`; `yParity?`: `undefined`; \} \| \{ `r`: `` `0x${string}` ``; `s`: `` `0x${string}` ``; `v`: `bigint`; `yParity?`: `number`; \} \| \{ `r`: `` `0x${string}` ``; `s`: `` `0x${string}` ``; `v?`: `bigint`; `yParity`: `number`; \} \| \{ `r`: `` `0x${string}` ``; `s`: `` `0x${string}` ``; `v`: `number`; `yParity?`: `number`; \} \| \{ `r`: `` `0x${string}` ``; `s`: `` `0x${string}` ``; `v?`: `number`; `yParity`: `number`; \}

Signature tuple encoded into the ratifier data.

## Returns

`` `0x${string}` ``

ABI-encoded ratifier data.

## Example

```ts
import { EcrecoverRatifierUtils } from "@morpho-org/midnight-sdk";

const data = EcrecoverRatifierUtils.encodeRatifierData({
  signature: {
    v: 27,
    r: "0x0000000000000000000000000000000000000000000000000000000000000000",
    s: "0x0000000000000000000000000000000000000000000000000000000000000000",
  },
  root: "0x0000000000000000000000000000000000000000000000000000000000000000",
  leafIndex: 0n,
  proof: [],
});
console.log(data);
```
