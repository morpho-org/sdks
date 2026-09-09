[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [SetterRatifierUtils](../README.md) / ratify

# Function: ratify()

> **ratify**(`params`): readonly [`Item`](../../Payload/type-aliases/Item.md)[]

Defined in: [packages/midnight-sdk/src/signatures/SetterRatifierUtils.ts:346](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/SetterRatifierUtils.ts#L346)

Returns payload-ready items after a Setter root has been approved.

Use after `Tree.mempoolValidate` and the root approval
transaction has been submitted for every maker in the tree. Setter
approvals are keyed by maker and root, so mixed-maker trees need one
approval per maker for the same root. The returned items can be passed
directly to `Payload.encode`. All offers in the tree must use one ratifier
address; build separate trees per ratifier.

## Parameters

### params

#### tree

[`RatifierTreeInput`](../../../type-aliases/RatifierTreeInput.md)

Setter-ratified offer tree-like input whose root has already been approved onchain.

## Returns

readonly [`Item`](../../Payload/type-aliases/Item.md)[]

Items containing each offer and its ratifier data.

## Throws

when the tree is invalid or contains multiple ratifiers.

## Example

```ts
import { SetterRatifierUtils, Tree } from "@morpho-org/midnight-sdk";
import { Offer } from "@morpho-org/midnight-sdk";
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
  ratifier: "0x0000000000000000000000000000000000005000",
  maxUnits: 100n,
});

const items = SetterRatifierUtils.ratify({
  tree: Tree.create([offer]),
});
console.log(items.length);
```
