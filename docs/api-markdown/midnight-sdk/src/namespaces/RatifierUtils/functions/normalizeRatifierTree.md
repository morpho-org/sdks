[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [RatifierUtils](../README.md) / normalizeRatifierTree

# Function: normalizeRatifierTree()

> **normalizeRatifierTree**(`params`): `object`

Defined in: [packages/midnight-sdk/src/signatures/RatifierUtils.ts:186](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/RatifierUtils.ts#L186)

Normalizes a ratifier tree input and asserts it uses one ratifier address.

Pass an existing `Tree` or `TreeLike` object to reuse cached offers,
leaves, root, and height. Pass raw offer/group input when the caller has
not materialized a tree yet.

## Parameters

### params

#### label

`"Ecrecover"` \| `"Setter"`

Ratifier label used in validation errors.

#### tree

[`RatifierTreeInput`](../../../type-aliases/RatifierTreeInput.md)

Tree-like object or raw offer/group input.

## Returns

`object`

Normalized tree-like data and its shared ratifier.

### ratifier

> `readonly` **ratifier**: `` `0x${string}` ``

### tree

> `readonly` **tree**: [`TreeLike`](../../../interfaces/TreeLike.md)

## Throws

when the tree is empty or contains multiple ratifiers.

## Throws

when normalized raw input exceeds the supported tree height.

## Example

```ts
import { Offer, RatifierUtils } from "@morpho-org/midnight-sdk";
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
const { tree, ratifier } = RatifierUtils.normalizeRatifierTree({
  tree: [offer],
  label: "Ecrecover",
});
console.log(tree.root, ratifier);
```
