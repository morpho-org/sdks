[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [EcrecoverRatifierUtils](../README.md) / typedData

# Function: typedData()

> **typedData**(`params`): [`EcrecoverRatificationTypedData`](../../../interfaces/EcrecoverRatificationTypedData.md)

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:552](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L552)

Builds EcrecoverRatifier typed data for a tree-like input.

Use after the tree is built and validated, before requesting the signer
signature. The EIP-712 verifier is derived from the shared ratifier address
on the tree offers. `ratify` calls this for you when given a client and
account.

## Parameters

### params

[`EcrecoverRatifierTypedDataParams`](../../../interfaces/EcrecoverRatifierTypedDataParams.md)

## Returns

[`EcrecoverRatificationTypedData`](../../../interfaces/EcrecoverRatificationTypedData.md)

EIP-712 typed-data descriptor.

## Throws

when the tree is invalid or contains multiple ratifiers.

## Throws

when the tree height is unsupported.

## Example

```ts
import { EcrecoverRatifierUtils, Tree } from "@morpho-org/midnight-sdk";
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

const typedData = EcrecoverRatifierUtils.typedData({
  tree: Tree.create([offer]),
  chainId: 8453n,
});
console.log(typedData.primaryType);
```
