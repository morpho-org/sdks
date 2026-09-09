[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [OfferChainUtils](../README.md) / buildLendFixedRateOfferChain

# Function: buildLendFixedRateOfferChain()

> **buildLendFixedRateOfferChain**(`params`): readonly [`FixedRateOfferChainLeg`](../../../interfaces/FixedRateOfferChainLeg.md)[]

Defined in: [packages/midnight-sdk/src/offers/OfferChainUtils.ts:285](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/OfferChainUtils.ts#L285)

Builds lend-side buy-offer legs that approximate one fixed maker rate over time.

Use before a make-lend flow when a lender wants one displayed fixed lend
rate across a longer window. Map the returned legs to
`Offer.create({ buy: true, ... })`, then group and submit them through the
maker flow.

Lend chains read their target rate at each leg's start edge. The first leg
may start before `chainStartTimestamp`; clamping that edge would move the
recoverable display rate below the maker's target.

## Parameters

### params

[`BuildFixedRateOfferChainParams`](../../../interfaces/BuildFixedRateOfferChainParams.md)

Fixed-rate offer-chain parameters without a side field.

## Returns

readonly [`FixedRateOfferChainLeg`](../../../interfaces/FixedRateOfferChainLeg.md)[]

Lend-side offer legs that can be mapped to `Offer.create({ buy: true, ... })`.

## Throws

when an input is invalid or the end timestamp exceeds the supported horizon.

## Example

```ts
import { Offer, OfferChainUtils } from "@morpho-org/midnight-sdk";

const legs = OfferChainUtils.buildLendFixedRateOfferChain({
  targetRate: 0.05,
  tickSpacing: market.tickSpacing,
  maturityTimestamp: market.params.maturity,
  chainStartTimestamp: now,
  chainEndTimestamp: expiry,
});
const offers = legs.map((leg) =>
  Offer.create({
    ...baseOffer,
    buy: true,
    tick: leg.tick,
    start: leg.startTimestamp,
    expiry: leg.expiryTimestamp,
  }),
);
```
