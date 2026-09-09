[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [OfferUtils](../README.md) / hashStruct

# Function: hashStruct()

> **hashStruct**(`offerStruct`): `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/offers/OfferUtils.ts:186](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/OfferUtils.ts#L186)

Computes the canonical protocol offer hash for an ABI-compatible offer.

Use when you already have an `OfferStruct`, for example from
`GroupUtils.toStructs`, `TreeUtils.buildDescriptor`, or decoded payload
bytes. Use `hash` when you still have a grouped `Offer` or grouped plain
offer input, and `groupHash` when deriving a group id from the zero-group
hash.

## Parameters

### offerStruct

[`OfferStruct`](../../../interfaces/OfferStruct.md)

ABI-compatible offer to hash.

## Returns

`` `0x${string}` ``

Offer hash.

## Example

```ts
import { Offer, OfferUtils } from "@morpho-org/midnight-sdk";
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
const hash = OfferUtils.hashStruct(
  OfferUtils.toStruct({ offer, group: zeroHash }),
);
console.log(hash);
```
