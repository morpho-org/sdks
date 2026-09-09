[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [EcrecoverRatifierUtils](../README.md) / ratifierData

# Function: ratifierData()

> **ratifierData**(`params`): `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:1104](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L1104)

Builds one ratifier-data value for a tree leaf.

Use after a tree has been signed when a caller needs data for one offer
leaf. Use `ratify` to produce payload-ready items for the whole tree.

## Parameters

### params

[`EcrecoverRatifierDataParams`](../../../interfaces/EcrecoverRatifierDataParams.md)

## Returns

`` `0x${string}` ``

ABI-encoded EcrecoverRatifier data.

## Throws

when the leaf index is outside the tree or the tree contains multiple ratifiers.

## Example

```ts
import { EcrecoverRatifierUtils, Offer, Tree } from "@morpho-org/midnight-sdk";
import { zeroAddress, zeroHash } from "viem";

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
const data = EcrecoverRatifierUtils.ratifierData({
  tree: Tree.create([offer]),
  leafIndex: 0n,
  signature: { v: 27, r: zeroHash, s: zeroHash },
});
console.log(data);
```
