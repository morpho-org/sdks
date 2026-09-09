[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / getEffectiveLocale

# Function: getEffectiveLocale()

> **getEffectiveLocale**(): `string`

Defined in: [packages/morpho-ts/src/format/locale.ts:71](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/format/locale.ts#L71)

Returns the browser locale when available.

## Returns

`string`

The effective browser locale, or `en-US` outside a browser or after locale validation fails.

## Example

```ts
import { getEffectiveLocale } from "@morpho-org/morpho-ts";

const locale = getEffectiveLocale();
// "en-US"
```
