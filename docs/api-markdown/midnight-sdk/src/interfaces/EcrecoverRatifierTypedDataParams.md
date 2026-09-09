[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / EcrecoverRatifierTypedDataParams

# Interface: EcrecoverRatifierTypedDataParams

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:295](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L295)

Parameters for [EcrecoverRatifierUtils.typedData](../namespaces/EcrecoverRatifierUtils/functions/typedData.md).

Use these after `Tree.create` and after the maker route has been classified
as `ecrecover`.

## Example

```ts
import { Offer, Tree, type EcrecoverRatifierTypedDataParams } from "@morpho-org/midnight-sdk";
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
const params: EcrecoverRatifierTypedDataParams = {
  tree: Tree.create([offer]),
  chainId: 8453n,
};
console.log(params.chainId);
```

## Properties

### chainId

> `readonly` **chainId**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:299](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L299)

Chain id used by the EIP-712 domain.

***

### tree

> `readonly` **tree**: [`RatifierTreeInput`](../type-aliases/RatifierTreeInput.md)

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:297](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L297)

Tree-like input being ratified. Existing `Tree` instances reuse cached hashes and proofs.
