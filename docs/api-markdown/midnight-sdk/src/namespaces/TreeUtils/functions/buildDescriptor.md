[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [TreeUtils](../README.md) / buildDescriptor

# Function: buildDescriptor()

> **buildDescriptor**(`entries`): [`TreeDescriptor`](../../../interfaces/TreeDescriptor.md)

Defined in: [packages/midnight-sdk/src/signatures/TreeUtils.ts:694](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/TreeUtils.ts#L694)

Builds a tree descriptor and Merkle root. Non-power-of-two batches are
padded with protocol-zero offers at the highest leaf indices.

Use after `Group.create` or standalone `Offer.create` when you need the
padded leaves for custom signing, root approval, or proof construction.
Groups are encoded with their derived shared group id, and standalone
offers are encoded as singleton groups with the same algorithm.
`Tree.create` calls this internally and is the simpler API for most
make-side code.

## Parameters

### entries

[`TreeCreateParams`](../../../type-aliases/TreeCreateParams.md)

Groups or standalone offers in leaf order.

## Returns

[`TreeDescriptor`](../../../interfaces/TreeDescriptor.md)

Tree descriptor.

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
const tree = TreeUtils.buildDescriptor([offer]);
console.log(tree.root);
```
