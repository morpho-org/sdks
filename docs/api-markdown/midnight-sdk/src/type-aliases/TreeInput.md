[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / TreeInput

# Type Alias: TreeInput

> **TreeInput** = [`Tree`](../classes/Tree.md) \| [`TreeCreateParams`](TreeCreateParams.md) \| [`GroupInput`](GroupInput.md)

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:271](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L271)

Plain creation input or class tree accepted by [Tree.from](../classes/Tree.md#from).

Use this only at boundaries that intentionally convert caller input into a
`Tree`. Ratifier helpers accept [RatifierTreeInput](RatifierTreeInput.md) instead, so they
can reuse an existing `Tree` or normalize raw offer/group input.

## Example

```ts
import { Offer, type TreeInput } from "@morpho-org/midnight-sdk";
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
const tree: TreeInput = [offer];
console.log(tree);
```
