[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / validateOfferSides

# Function: validateOfferSides()

> **validateOfferSides**(`offers`, `expectedBuy`): `void`

Defined in: [packages/morpho-sdk/src/helpers/validateOfferSides.ts:21](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/helpers/validateOfferSides.ts#L21)

Validates that Midnight offers match a named flow's maker side.

Use before encoding a side-specific Midnight action: make-lend and
take-borrow consume buy offers (`expectedBuy: true`), while make-borrow and
take-lend consume sell offers (`expectedBuy: false`).

## Parameters

### offers

`Iterable`\<\{ `buy`: `boolean`; \}\>

Offers to validate.

### expectedBuy

`boolean`

Expected maker side for every offer.

## Returns

`void`

Nothing after every offer has the expected maker side.

## Throws

when any offer side differs from `expectedBuy`.

## Example

```ts
import { validateOfferSides } from "@morpho-org/morpho-sdk";

validateOfferSides([{ buy: false }, { buy: false }], false);
```
