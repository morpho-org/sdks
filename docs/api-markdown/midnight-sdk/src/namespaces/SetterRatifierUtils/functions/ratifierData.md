[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [SetterRatifierUtils](../README.md) / ratifierData

# Function: ratifierData()

> **ratifierData**(`params`): `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/signatures/SetterRatifierUtils.ts:281](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/SetterRatifierUtils.ts#L281)

Builds one ratifier-data value for a tree leaf.

Use after root approval when a caller needs data for one offer leaf. Use
`ratify` to produce payload-ready items for the whole tree. Setter
approvals are keyed by maker and root, so the maker for this leaf must have
approved the tree root onchain.

## Parameters

### params

[`SetterRatifierDataParams`](../../../interfaces/SetterRatifierDataParams.md)

## Returns

`` `0x${string}` ``

ABI-encoded SetterRatifier data.

## Throws

when the leaf index is outside the tree or the tree contains multiple ratifiers.

## Example

```ts
import { Offer, SetterRatifierUtils, Tree } from "@morpho-org/midnight-sdk";
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
const data = SetterRatifierUtils.ratifierData({
  tree: Tree.create([offer]),
  leafIndex: 0n,
});
console.log(data);
```
