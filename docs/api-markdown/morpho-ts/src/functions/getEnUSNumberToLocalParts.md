[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / getEnUSNumberToLocalParts

# Function: getEnUSNumberToLocalParts()

> **getEnUSNumberToLocalParts**(`numStr`, `locale?`): [`LocaleParts`](../type-aliases/LocaleParts.md)

Defined in: [packages/morpho-ts/src/format/locale.ts:149](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/format/locale.ts#L149)

Converts an `en-US` numeric string to localized parts.

## Parameters

### numStr

`string`

Number string formatted with `en-US` separators.

### locale?

`string`

Optional locale to convert to. Uses the effective browser locale when omitted.

## Returns

[`LocaleParts`](../type-aliases/LocaleParts.md)

The localized value with the symbols and locale used for conversion.

## Example

```ts
import { getEnUSNumberToLocalParts } from "@morpho-org/morpho-ts";

const parts = getEnUSNumberToLocalParts("1,234.6", "en-US");
// { decimalSymbol: ".", groupSymbol: ",", locale: "en-US", value: "1,234.6" }
```
