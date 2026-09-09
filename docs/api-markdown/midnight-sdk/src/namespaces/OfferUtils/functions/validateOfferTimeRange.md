[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [OfferUtils](../README.md) / validateOfferTimeRange

# Function: validateOfferTimeRange()

> **validateOfferTimeRange**(`params`): `object`

Defined in: [packages/midnight-sdk/src/offers/OfferUtils.ts:371](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/OfferUtils.ts#L371)

Validates and normalizes an offer start/expiry range.

Use this before `Offer.create` when a UI edits dates separately from other
offer fields. `Offer.create` calls it internally.

## Parameters

### params

#### expiry

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

Offer expiry timestamp.

#### start?

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

Optional offer start timestamp; defaults to zero.

## Returns

`object`

Normalized start and expiry timestamps.

### expiry

> **expiry**: `bigint`

### start

> **start**: `bigint`

## Throws

when the range is negative or expiry is before start.

## Example

```ts
import { OfferUtils } from "@morpho-org/midnight-sdk";

const range = OfferUtils.validateOfferTimeRange({ start: 0n, expiry: 1n });
console.log(range.expiry);
```
