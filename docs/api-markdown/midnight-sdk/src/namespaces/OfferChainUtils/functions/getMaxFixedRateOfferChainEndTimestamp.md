[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [OfferChainUtils](../README.md) / getMaxFixedRateOfferChainEndTimestamp

# Function: getMaxFixedRateOfferChainEndTimestamp()

> **getMaxFixedRateOfferChainEndTimestamp**(`params`): `bigint`

Defined in: [packages/midnight-sdk/src/offers/OfferChainUtils.ts:459](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/OfferChainUtils.ts#L459)

Returns the latest supported end timestamp for a fixed-rate offer chain.

Chains intentionally stop before the final part of the maturity window
because rate sensitivity accelerates near maturity and would require too
many short-lived offers for a stable maker quote.
Call this when constraining a make-offer expiry selector, then pass the
selected timestamp to the lend-only or borrow-only chain builder.

## Parameters

### params

Maturity and chain-start timestamps.

#### chainStartTimestamp

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

First timestamp the chain should cover.

#### maturityTimestamp

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

Market maturity timestamp in seconds.

## Returns

`bigint`

Latest accepted chain end timestamp.

## Throws

when a timestamp is invalid.

## Example

```ts
import { OfferChainUtils } from "@morpho-org/midnight-sdk";

const maxExpiry = OfferChainUtils.getMaxFixedRateOfferChainEndTimestamp({
  maturityTimestamp: market.params.maturity,
  chainStartTimestamp: now,
});
console.log(maxExpiry);
```
