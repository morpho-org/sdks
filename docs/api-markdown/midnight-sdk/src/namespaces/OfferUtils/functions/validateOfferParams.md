[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [OfferUtils](../README.md) / validateOfferParams

# Function: validateOfferParams()

> **validateOfferParams**(`params`): `object`

Defined in: [packages/midnight-sdk/src/offers/OfferUtils.ts:569](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/OfferUtils.ts#L569)

Validates deterministic make-offer parameters without constructing an offer.

Use when an app needs normalized maker input or field-level errors before
instantiating an `Offer`. `Offer.create` uses the same validation and then
constructs the class instance for grouping and trees.

## Parameters

### params

`Pick`\<[`BuildOfferParams`](../../../interfaces/BuildOfferParams.md), `"buy"` \| `"maker"` \| `"tick"` \| `"tickSpacing"` \| `"maxUnits"` \| `"maxAssets"` \| `"continuousFeeCap"` \| `"start"` \| `"expiry"` \| `"receiverIfMakerIsSeller"`\>

## Returns

`object`

Normalized deterministic offer parameters.

### continuousFeeCap

> `readonly` **continuousFeeCap**: `bigint`

### expiry

> `readonly` **expiry**: `bigint`

### maxAssets

> `readonly` **maxAssets**: `bigint`

### maxUnits

> `readonly` **maxUnits**: `bigint`

### receiverIfMakerIsSeller

> `readonly` **receiverIfMakerIsSeller**: `` `0x${string}` ``

### start

> `readonly` **start**: `bigint`

### tick

> `readonly` **tick**: `bigint`

### tickSpacing

> `readonly` **tickSpacing**: `bigint`

## Throws

when a deterministic offer parameter cannot satisfy protocol rules.

## Example

```ts
import { OfferUtils } from "@morpho-org/midnight-sdk";

const params = OfferUtils.validateOfferParams({
  buy: true,
  maker: "0x0000000000000000000000000000000000009000",
  tick: 5_000n,
  expiry: 3_600n,
  maxUnits: 100n,
});
console.log(params.maxAssets);
```
