[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [OfferUtils](../README.md) / validateOfferGroup

# Function: validateOfferGroup()

> **validateOfferGroup**(`params`): readonly [`Offer`](../../../classes/Offer.md)[]

Defined in: [packages/midnight-sdk/src/offers/OfferUtils.ts:657](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/OfferUtils.ts#L657)

Validates protocol-level mechanics for one Midnight offer consumption group.

Use before deriving a content-addressed group id. Grouped offers must share
maker, side, loan token, cap mode, and cap value because Midnight tracks one
consumed scalar per maker and group. `Group.create` calls this automatically;
call it directly only when you need the normalized offers without
constructing a `Group`.

## Parameters

### params

#### offers

`Iterable`\<[`IOffer`](../../../interfaces/IOffer.md)\>

Offers to validate as one protocol consumption group.

## Returns

readonly [`Offer`](../../../classes/Offer.md)[]

Normalized offers in the same order as the input entries.

## Throws

when the group violates protocol mechanics.

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
const offers = OfferUtils.validateOfferGroup({ offers: [offer] });
console.log(offers.length);
```
