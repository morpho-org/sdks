[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [OfferChainUtils](../README.md) / buildBorrowFixedRateOfferChain

# Function: buildBorrowFixedRateOfferChain()

> **buildBorrowFixedRateOfferChain**(`params`): readonly [`FixedRateOfferChainLeg`](../../../interfaces/FixedRateOfferChainLeg.md)[]

Defined in: [packages/midnight-sdk/src/offers/OfferChainUtils.ts:120](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/OfferChainUtils.ts#L120)

Builds borrow-side sell-offer legs that approximate one fixed maker rate over time.

Use before a make-borrow or supply-collateral-and-make-borrow flow when a
borrower wants one displayed fixed borrow rate across a longer window. Map
the returned legs to `Offer.create({ buy: false, ... })`, then group and
submit them through the maker flow.

Borrow chains read their target rate at each leg's expiry edge. If a leg
would need to extend past `chainEndTimestamp`, it is dropped rather than
clamped so the expiry edge remains the recoverable target-rate edge.

## Parameters

### params

[`BuildFixedRateOfferChainParams`](../../../interfaces/BuildFixedRateOfferChainParams.md)

Fixed-rate offer-chain parameters without a side field.

## Returns

readonly [`FixedRateOfferChainLeg`](../../../interfaces/FixedRateOfferChainLeg.md)[]

Borrow-side offer legs that can be mapped to `Offer.create({ buy: false, ... })`.

## Throws

when an input is invalid or the end timestamp exceeds the supported horizon.

## Example

```ts
import { Offer, OfferChainUtils } from "@morpho-org/midnight-sdk";

const legs = OfferChainUtils.buildBorrowFixedRateOfferChain({
  targetRate: 0.08,
  tickSpacing: market.tickSpacing,
  maturityTimestamp: market.params.maturity,
  chainStartTimestamp: now,
  chainEndTimestamp: expiry,
});
const offers = legs.map((leg) =>
  Offer.create({
    ...baseOffer,
    buy: false,
    tick: leg.tick,
    start: leg.startTimestamp,
    expiry: leg.expiryTimestamp,
  }),
);
```
