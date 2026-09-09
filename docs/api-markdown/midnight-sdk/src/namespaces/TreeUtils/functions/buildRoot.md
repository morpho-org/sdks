[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [TreeUtils](../README.md) / buildRoot

# Function: buildRoot()

> **buildRoot**(`entries`): `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:780](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L780)

Builds only the tree root.

Use when only the root is needed, for example to compare a locally built
tree with an approved root. Use `Tree.create` or `buildDescriptor` if later
proof generation is required.

## Parameters

### entries

[`TreeCreateParams`](../../../type-aliases/TreeCreateParams.md)

Groups or standalone offers in leaf order.

## Returns

`` `0x${string}` ``

Merkle root.

## Throws

when the offer count is empty, all padding, or duplicated.

## Throws

when the padded tree exceeds supported ratifier typehashes.

## Example

```ts
import { Offer, TreeUtils } from "@morpho-org/midnight-sdk";
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
const root = TreeUtils.buildRoot([offer]);
console.log(root);
```
