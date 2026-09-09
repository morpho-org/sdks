[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / TreeLike

# Interface: TreeLike

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:315](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L315)

Tree-shaped data required by ratifier helpers.

A `Tree` class instance satisfies this shape and is the optimal input when a
caller already built one, because the cached offers, leaves, root, and height
are reused for signatures and proofs. Plain objects with these fields are
also accepted by ratifier helpers.

## Example

```ts
import { Offer, Tree, type TreeLike } from "@morpho-org/midnight-sdk";
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
const tree: TreeLike = Tree.create([offer]);
console.log(tree.root);
```

## Properties

### height

> `readonly` **height**: `number`

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:325](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L325)

Tree height.

***

### leaves

> `readonly` **leaves**: readonly `` `0x${string}` ``[]

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:321](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L321)

Leaf hashes for `paddedOffers`.

***

### offers

> `readonly` **offers**: readonly [`IOffer`](IOffer.md)[]

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:317](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L317)

Non-padding offers in leaf order.

***

### paddedOffers

> `readonly` **paddedOffers**: readonly [`OfferStruct`](OfferStruct.md)[]

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:319](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L319)

ABI-compatible offers in leaf order, including protocol-zero padding.

***

### root

> `readonly` **root**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:323](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L323)

Merkle root.
