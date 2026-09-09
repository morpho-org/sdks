[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / BuildFixedRateOfferChainParams

# Interface: BuildFixedRateOfferChainParams

Defined in: [packages/midnight-sdk/src/offers/OfferChainUtils.ts:24](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/OfferChainUtils.ts#L24)

Parameters shared by lend-only and borrow-only fixed-rate offer-chain builders.

## Properties

### chainEndTimestamp

> `readonly` **chainEndTimestamp**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/offers/OfferChainUtils.ts:34](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/OfferChainUtils.ts#L34)

Latest timestamp the chain may cover.

***

### chainStartTimestamp

> `readonly` **chainStartTimestamp**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/offers/OfferChainUtils.ts:32](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/OfferChainUtils.ts#L32)

First timestamp the chain should cover.

***

### maturityTimestamp

> `readonly` **maturityTimestamp**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/offers/OfferChainUtils.ts:30](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/OfferChainUtils.ts#L30)

Market maturity timestamp in seconds.

***

### targetRate

> `readonly` **targetRate**: `number`

Defined in: [packages/midnight-sdk/src/offers/OfferChainUtils.ts:26](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/OfferChainUtils.ts#L26)

Target yearly fixed rate as a decimal number, for example `0.05` for 5%.

***

### tickSpacing

> `readonly` **tickSpacing**: [`BigIntish`](../../../morpho-ts/src/type-aliases/BigIntish.md)

Defined in: [packages/midnight-sdk/src/offers/OfferChainUtils.ts:28](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/OfferChainUtils.ts#L28)

Tick spacing enforced by the market.
