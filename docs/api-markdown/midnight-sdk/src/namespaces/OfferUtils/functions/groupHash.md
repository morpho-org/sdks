[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [OfferUtils](../README.md) / groupHash

# Function: groupHash()

> **groupHash**(`offer`): `` `0x${string}` ``

Defined in: [packages/midnight-sdk/src/offers/OfferUtils.ts:299](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/OfferUtils.ts#L299)

Computes the offer hash used to derive a content-addressed group id.

The encoded group is always the protocol zero hash. Use this only for
standalone or grouped-offer id derivation, not for final tree leaves or
payload offers.

## Parameters

### offer

`Omit`\<[`IOffer`](../../../interfaces/IOffer.md), `"group"`\>

Offer to hash without a group id.

## Returns

`` `0x${string}` ``

Offer hash encoded with the protocol zero group id.

## Example

```ts
import { Offer, OfferUtils } from "@morpho-org/midnight-sdk";
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
const hash = OfferUtils.groupHash(offer);
console.log(hash);
```
