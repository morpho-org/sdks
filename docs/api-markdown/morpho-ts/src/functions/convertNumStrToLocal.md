[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / convertNumStrToLocal

# Function: convertNumStrToLocal()

> **convertNumStrToLocal**(`numStr`, `from`, `to`): `string`

Defined in: [packages/morpho-ts/src/format/locale.ts:101](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/format/locale.ts#L101)

Converts a localized numeric string from one locale's separators to another.

## Parameters

### numStr

`string`

Number string formatted in the `from` locale.

### from

`string`

Locale that `numStr` currently uses.

### to

`string`

Locale to convert separators to.

## Returns

`string`

The numeric string with separators from the `to` locale.

## Example

```ts
import { convertNumStrToLocal } from "@morpho-org/morpho-ts";

const value = convertNumStrToLocal("1,234.6", "en-US", "de-DE");
// "1.234,6"
```
