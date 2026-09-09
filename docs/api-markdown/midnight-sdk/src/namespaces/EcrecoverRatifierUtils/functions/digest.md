[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [EcrecoverRatifierUtils](../README.md) / digest

# Function: digest()

> **digest**(`params`): `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts:626](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/signatures/EcrecoverRatifierUtils.ts#L626)

Builds the EcrecoverRatifier digest used by the Solidity ratifier.

## Parameters

### params

[`EcrecoverRatifierTypedDataParams`](../../../interfaces/EcrecoverRatifierTypedDataParams.md)

## Returns

`` `0x${string}` ``

EIP-712 digest.

## Throws

when the tree contains multiple ratifiers.

## Throws

when height exceeds 20.

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

const digest = EcrecoverRatifierUtils.digest({
  tree: Tree.create([offer]),
  chainId: 8453n,
});
console.log(digest);
```
