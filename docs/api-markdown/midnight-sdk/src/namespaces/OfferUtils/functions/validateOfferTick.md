[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [OfferUtils](../README.md) / validateOfferTick

# Function: validateOfferTick()

> **validateOfferTick**(`params`): `object`

Defined in: [packages/midnight-sdk/src/offers/OfferUtils.ts:321](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/offers/OfferUtils.ts#L321)

Validates and normalizes a Midnight offer tick and spacing.

Use this for form-level validation before `Offer.create` when you want to
surface a tick-specific issue. `Offer.create` calls it internally.

## Parameters

### params

#### tick

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

Offer tick to validate.

#### tickSpacing?

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

Optional market tick spacing; defaults to `DEFAULT_TICK_SPACING`.

## Returns

`object`

Normalized tick and tick spacing.

### tick

> **tick**: `bigint`

### tickSpacing

> **tickSpacing**: `bigint`

## Throws

when the tick or spacing cannot be accepted by Midnight.

## Example

```ts
import { OfferUtils } from "@morpho-org/midnight-sdk";

const { tick } = OfferUtils.validateOfferTick({ tick: 4n });
console.log(tick);
```
