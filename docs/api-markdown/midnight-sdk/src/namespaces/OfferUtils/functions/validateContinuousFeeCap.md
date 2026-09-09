[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [OfferUtils](../README.md) / validateContinuousFeeCap

# Function: validateContinuousFeeCap()

> **validateContinuousFeeCap**(`params`): `object`

Defined in: [packages/midnight-sdk/src/offers/OfferUtils.ts:478](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/OfferUtils.ts#L478)

Validates and normalizes the maximum continuous fee an offer accepts.

Use this before `Offer.create` when a maker UI exposes fee tolerance.
`Offer.create` calls it internally and defaults omitted values to zero so
fresh offers fail closed unless the maker explicitly accepts a fee cap.

## Parameters

### params

#### continuousFeeCap?

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

Optional maximum market continuous fee accepted by this offer.

## Returns

`object`

Normalized continuous fee cap.

### continuousFeeCap

> **continuousFeeCap**: `bigint`

## Throws

when the cap is negative.

## Example

```ts
import { OfferUtils } from "@morpho-org/midnight-sdk";

const cap = OfferUtils.validateContinuousFeeCap({});
console.log(cap.continuousFeeCap);
```
