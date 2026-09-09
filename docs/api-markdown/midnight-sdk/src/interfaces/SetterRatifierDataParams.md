[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / SetterRatifierDataParams

# Interface: SetterRatifierDataParams

Defined in: [packages/midnight-sdk/src/signatures/SetterRatifierUtils.ts:91](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/SetterRatifierUtils.ts#L91)

Parameters for one SetterRatifier ratifier-data value.

Use after the offer maker or delegate has approved the tree root onchain.
Setter approvals are keyed by maker and root, so a mixed-maker tree needs one
approval per maker for the same root.

## Example

```ts
import { Offer, Tree, type SetterRatifierDataParams } from "@morpho-org/midnight-sdk";
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
const params: SetterRatifierDataParams = {
  tree: Tree.create([offer]),
  leafIndex: 0n,
};
console.log(params.leafIndex);
```

## Properties

### leafIndex

> `readonly` **leafIndex**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/signatures/SetterRatifierUtils.ts:95](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/SetterRatifierUtils.ts#L95)

Leaf index to prove.

***

### tree

> `readonly` **tree**: [`RatifierTreeInput`](../type-aliases/RatifierTreeInput.md)

Defined in: [packages/midnight-sdk/src/signatures/SetterRatifierUtils.ts:93](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/SetterRatifierUtils.ts#L93)

Tree-like input that produced the proof. Existing `Tree` instances reuse cached hashes and proofs.
