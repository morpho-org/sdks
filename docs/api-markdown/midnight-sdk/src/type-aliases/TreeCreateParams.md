[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / TreeCreateParams

# Type Alias: TreeCreateParams

> **TreeCreateParams** = readonly [`GroupInput`](GroupInput.md)[]

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:228](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L228)

Entries accepted by [Tree.create](../classes/Tree.md#create).

Entries are either explicit groups or standalone offers. Explicit groups are
flattened, and standalone offers are hashed with their own group ids.

## Example

```ts
import { Tree, type TreeCreateParams } from "@morpho-org/midnight-sdk";
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
  ratifier: "0x0000000000000000000000000000000000004000",
  maxUnits: 100n,
});
const params = [offer] satisfies TreeCreateParams;
const tree = Tree.create(params);
console.log(tree.root);
```
