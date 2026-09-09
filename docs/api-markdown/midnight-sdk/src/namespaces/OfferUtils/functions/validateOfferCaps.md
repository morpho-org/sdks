[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [OfferUtils](../README.md) / validateOfferCaps

# Function: validateOfferCaps()

> **validateOfferCaps**(`params`): `object`

Defined in: [packages/midnight-sdk/src/offers/OfferUtils.ts:414](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/OfferUtils.ts#L414)

Validates and normalizes mutually exclusive offer caps.

Use this before `Offer.create` when a UI lets makers choose between a unit
cap and an asset cap. `Offer.create` calls it internally.

## Parameters

### params

#### maxAssets?

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

Optional buyer or seller asset cap; defaults to zero.

#### maxUnits?

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

Optional unit cap; defaults to zero.

## Returns

`object`

Normalized unit and asset caps.

### maxAssets

> **maxAssets**: `bigint`

### maxUnits

> **maxUnits**: `bigint`

## Throws

when caps are negative, both zero, or both non-zero.

## Example

```ts
import { OfferUtils } from "@morpho-org/midnight-sdk";

const caps = OfferUtils.validateOfferCaps({ maxAssets: 100n });
console.log(caps.maxAssets);
```
