[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / TreeProof

# Interface: TreeProof

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:177](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L177)

Merkle proof descriptor for one tree leaf.

Ratifier data embeds this information so a taker can prove the offer belongs
to the maker-approved or maker-signed root.

## Example

```ts
import { Offer, Tree, type TreeProof } from "@morpho-org/midnight-sdk";
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
const proof: TreeProof = Tree.create([offer]).proof(0n);
console.log(proof.leafIndex);
```

## Extended by

- [`DecodedEcrecoverRatifierData`](DecodedEcrecoverRatifierData.md)

## Properties

### leafIndex

> `readonly` **leafIndex**: `bigint`

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:181](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L181)

Leaf index in the tree.

***

### proof

> `readonly` **proof**: readonly `` `0x${string}` ``[]

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:183](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L183)

Sibling hashes from leaf to root.

***

### root

> `readonly` **root**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:179](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L179)

Merkle root.
