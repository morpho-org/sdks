[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [OfferUtils](../README.md) / toStruct

# Function: toStruct()

> **toStruct**(`params`): [`OfferStruct`](../../../interfaces/OfferStruct.md)

Defined in: [packages/midnight-sdk/src/offers/OfferUtils.ts:114](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/OfferUtils.ts#L114)

Converts an offer into the tuple object expected by viem ABI encoders.

This is the bridge from SDK/domain objects
into Merkle leaf hashing, payload items, and take calldata encoding.

## Parameters

### params

#### group?

`` `0x${string}` ``

Optional protocol group id override encoded into the ABI offer.

#### offer

[`IOffer`](../../../interfaces/IOffer.md)

Offer class or plain offer input to encode.

## Returns

[`OfferStruct`](../../../interfaces/OfferStruct.md)

ABI-compatible offer.

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
const struct = OfferUtils.toStruct({ offer });
console.log(struct.tick);
```
