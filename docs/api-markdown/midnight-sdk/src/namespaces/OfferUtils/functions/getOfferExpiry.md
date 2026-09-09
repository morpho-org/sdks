[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [OfferUtils](../README.md) / getOfferExpiry

# Function: getOfferExpiry()

> **getOfferExpiry**(`offer`): `bigint`

Defined in: [packages/midnight-sdk/src/offers/OfferUtils.ts:1091](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/OfferUtils.ts#L1091)

Returns an offer expiry timestamp.

Use in maker UIs, API response mappers, or quote filters when accepting
any plain object matching `IOffer` or an `Offer` instance. This does not validate
whether the offer is still live at the current block time.

## Parameters

### offer

`Pick`\<[`IOffer`](../../../interfaces/IOffer.md), `"expiry"`\>

Offer to inspect.

## Returns

`bigint`

Offer expiry.

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
const expiry = OfferUtils.getOfferExpiry(offer);
console.log(expiry);
```
