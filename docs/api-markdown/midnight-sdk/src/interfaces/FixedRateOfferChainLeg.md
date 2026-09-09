[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / FixedRateOfferChainLeg

# Interface: FixedRateOfferChainLeg

Defined in: [packages/midnight-sdk/src/offers/OfferChainUtils.ts:14](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/OfferChainUtils.ts#L14)

One time-bounded offer leg to convert into a Midnight `Offer.create` input.

## Properties

### expiryTimestamp

> `readonly` **expiryTimestamp**: `bigint`

Defined in: [packages/midnight-sdk/src/offers/OfferChainUtils.ts:20](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/OfferChainUtils.ts#L20)

Last timestamp at which the offer leg is active.

***

### startTimestamp

> `readonly` **startTimestamp**: `bigint`

Defined in: [packages/midnight-sdk/src/offers/OfferChainUtils.ts:18](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/OfferChainUtils.ts#L18)

First timestamp at which the offer leg is active.

***

### tick

> `readonly` **tick**: `bigint`

Defined in: [packages/midnight-sdk/src/offers/OfferChainUtils.ts:16](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/OfferChainUtils.ts#L16)

Spacing-aligned Midnight tick for this offer.
