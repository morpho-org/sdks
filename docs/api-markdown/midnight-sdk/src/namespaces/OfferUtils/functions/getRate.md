[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [OfferUtils](../README.md) / getRate

# Function: getRate()

> **getRate**(`params`): `bigint`

Defined in: [packages/midnight-sdk/src/offers/OfferUtils.ts:818](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/OfferUtils.ts#L818)

Converts an offer tick into a WAD per-second simple rate at a timestamp.

The rate is the offer's fixed period rate divided by the market's remaining
time to maturity at `timestamp`, rounded up.

## Parameters

### params

#### offer

`Pick`\<[`IOffer`](../../../interfaces/IOffer.md), `"market"` \| `"tick"`\>

Offer to inspect.

#### timestamp

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

Timestamp at which the rate is calculated.

## Returns

`bigint`

WAD per-second simple rate rounded up.

## Throws

when `market.maturity`, `timestamp`, or `tick` is negative.

## Throws

when `tick` exceeds `MAX_TICK`.

## Throws

when the tick price is zero or `timestamp` is at or after maturity.

## Example

```ts
import { Offer, OfferUtils } from "@morpho-org/midnight-sdk";

const offer = Offer.from({
  market: {
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
    enterGate: "0x0000000000000000000000000000000000000000",
    liquidatorGate: "0x0000000000000000000000000000000000000000",
  },
  buy: true,
  maker: "0x0000000000000000000000000000000000009000",
  start: 0n,
  expiry: 3_600n,
  tick: 5_000n,
  callback: "0x0000000000000000000000000000000000000000",
  callbackData: "0x",
  receiverIfMakerIsSeller: "0x0000000000000000000000000000000000000000",
  ratifier: "0x0000000000000000000000000000000000004000",
  reduceOnly: false,
  maxUnits: 100n,
  maxAssets: 0n,
  continuousFeeCap: 317097919n,
});
const rate = OfferUtils.getRate({ offer, timestamp: 1_000n });
console.log(rate);
```
