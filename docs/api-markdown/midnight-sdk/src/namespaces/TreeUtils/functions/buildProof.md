[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [TreeUtils](../README.md) / buildProof

# Function: buildProof()

> **buildProof**(`params`): [`TreeProof`](../../../interfaces/TreeProof.md)

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:832](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L832)

Builds a Merkle proof for one offer.

Use after tree construction when a custom ratifier needs one proof. The
built-in Ecrecover and Setter helpers call this while generating
`ratifierData`.

## Parameters

### params

#### leafIndex

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

Leaf index to prove.

#### tree

`Pick`\<[`TreeLike`](../../../interfaces/TreeLike.md), `"leaves"` \| `"root"`\>

Tree-like data with the root and leaves that contain the leaf.

## Returns

[`TreeProof`](../../../interfaces/TreeProof.md)

Proof descriptor.

## Throws

when leaf index is out of range.

## Example

```ts
import { Offer, Tree, TreeUtils } from "@morpho-org/midnight-sdk";
import { zeroAddress } from "viem";

const offer = Offer.create({
  market: {
    chainId: 8453,
    midnight: "0x0000000000000000000000000000000000001000",
    loanToken: "0x0000000000000000000000000000000000006000",
    collateralParams: [
      {
        token: "0x0000000000000000000000000000000000007000",
        lltv: 770000000000000000n,
        liquidationCursor: 250000000000000000n,
        oracle: "0x0000000000000000000000000000000000008000",
      },
    ],
    maturity: 54_000n,
    rcfThreshold: 0n,
    enterGate: zeroAddress,
    liquidatorGate: zeroAddress,
  },
  buy: true,
  maker: "0x0000000000000000000000000000000000009000",
  tick: 5_000n,
  expiry: 3_600n,
  ratifier: "0x0000000000000000000000000000000000004000",
  maxUnits: 100n,
});
const proof = TreeUtils.buildProof({
  tree: Tree.create([offer]),
  leafIndex: 0n,
});
console.log(proof.proof.length);
```
