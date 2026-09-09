[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / convertNumStrFromEffectiveTo

# Function: convertNumStrFromEffectiveTo()

> **convertNumStrFromEffectiveTo**(`numStr`, `to`): `string`

Defined in: [packages/morpho-ts/src/format/locale.ts:130](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/format/locale.ts#L130)

Converts a numeric string from the effective locale to another locale.

## Parameters

### numStr

`string`

Number string formatted in the effective browser locale.

### to

`string`

Locale to convert separators to.

## Returns

`string`

The numeric string with separators from the `to` locale.

## Example

```ts
import { convertNumStrFromEffectiveTo } from "@morpho-org/morpho-ts";

const value = convertNumStrFromEffectiveTo("1,234.6", "de-DE");
// "1.234,6" when the effective locale is `en-US`
```
