[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / getLocaleSymbols

# Function: getLocaleSymbols()

> **getLocaleSymbols**(`locale`): `LocaleSymbols`

Defined in: [packages/morpho-ts/src/format/locale.ts:37](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/format/locale.ts#L37)

Returns the decimal and grouping symbols for a locale.

## Parameters

### locale

`string`

Locale identifier to inspect, falling back to `en-US` when invalid.

## Returns

`LocaleSymbols`

The decimal symbol, grouping symbol, and requested locale string.

## Example

```ts
import { getLocaleSymbols } from "@morpho-org/morpho-ts";

const symbols = getLocaleSymbols("en-US");
// { decimalSymbol: ".", groupSymbol: ",", locale: "en-US" }
```
