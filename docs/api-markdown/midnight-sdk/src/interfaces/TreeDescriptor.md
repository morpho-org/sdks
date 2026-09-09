[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / TreeDescriptor

# Interface: TreeDescriptor

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:126](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L126)

Fully materialized tree descriptor.

Use this shape when a caller needs leaf structs, leaf hashes, root, and
height without keeping a `Tree` instance, for example before custom signing
or proof generation.

## Example

```ts
import { Offer, TreeUtils, type TreeDescriptor } from "@morpho-org/midnight-sdk";
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
const tree: TreeDescriptor = TreeUtils.buildDescriptor([offer]);
console.log(tree.root);
```

## Properties

### height

> `readonly` **height**: `number`

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:134](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L134)

Tree height.

***

### leaves

> `readonly` **leaves**: readonly `` `0x${string}` ``[]

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:130](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L130)

Leaf hashes for the padded tree.

***

### offers

> `readonly` **offers**: readonly [`OfferStruct`](OfferStruct.md)[]

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:128](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L128)

Offer structs in leaf order, including trailing empty padding.

***

### root

> `readonly` **root**: `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:132](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L132)

Merkle root.
