[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [TreeUtils](../README.md) / verifyProof

# Function: verifyProof()

> **verifyProof**(`params`): `boolean`

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:912](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L912)

Verifies a local Merkle proof against a root.

Use on the take-side or in tests to inspect decoded payload or ratifier
data before forwarding it to a transaction builder. Onchain ratifiers still
perform the authoritative verification.

## Parameters

### params

#### leafIndex

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

Leaf index proven by `params.proof`.

#### offer

[`IOffer`](../../../interfaces/IOffer.md)

Offer whose hash starts proof reconstruction.

#### proof

readonly `` `0x${string}` ``[]

Merkle proof siblings for the leaf.

#### root

`` `0x${string}` ``

Expected Merkle root.

## Returns

`boolean`

Whether the proof reconstructs the supplied root.

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
const tree = Tree.create([offer]);
const proof = tree.proof(0n);
const valid = TreeUtils.verifyProof({
  offer: tree.offers[0]!,
  root: proof.root,
  leafIndex: proof.leafIndex,
  proof: proof.proof,
});
console.log(valid);
```
