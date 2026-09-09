[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / EcrecoverRatifierDataParams

# Interface: EcrecoverRatifierDataParams

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:411](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L411)

Parameters for one EcrecoverRatifier ratifier-data value.

## Example

```ts
import { Offer, Tree, type EcrecoverRatifierDataParams } from "@morpho-org/midnight-sdk";
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
const params: EcrecoverRatifierDataParams = {
  tree: Tree.create([offer]),
  leafIndex: 0n,
  signature: { v: 27, r: zeroHash, s: zeroHash },
};
console.log(params.leafIndex);
```

## Properties

### leafIndex

> `readonly` **leafIndex**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:415](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L415)

Leaf index to prove.

***

### signature

> `readonly` **signature**: [`EcrecoverSignatureInput`](../type-aliases/EcrecoverSignatureInput.md)

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:417](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L417)

Ecrecover signature for the tree root.

***

### tree

> `readonly` **tree**: [`RatifierTreeInput`](../type-aliases/RatifierTreeInput.md)

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:413](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L413)

Tree-like input that produced the proof. Existing `Tree` instances reuse cached hashes and proofs.
