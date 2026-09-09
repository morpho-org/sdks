[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [OfferUtils](../README.md) / getPrice

# Function: getPrice()

> **getPrice**(`offer`): `bigint`

Defined in: [packages/midnight-sdk/src/offers/OfferUtils.ts:764](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/OfferUtils.ts#L764)

Converts an offer tick into its WAD zero-coupon price.

Use for display or local quote checks when accepting any plain object
matching `IOffer` or an `Offer` instance.

## Parameters

### offer

`Pick`\<[`IOffer`](../../../interfaces/IOffer.md), `"tick"`\>

Offer to inspect.

## Returns

`bigint`

WAD price rounded to the protocol price quantum.

## Throws

when `offer.tick` is negative.

## Throws

when `offer.tick` exceeds `MAX_TICK`.

## Example

```ts
import { OfferUtils } from "@morpho-org/midnight-sdk";

const price = OfferUtils.getPrice({ tick: 5_000n });
console.log(price);
```
