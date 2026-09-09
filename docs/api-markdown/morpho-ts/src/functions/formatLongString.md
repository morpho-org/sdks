[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / formatLongString

# Function: formatLongString()

> **formatLongString**(`str`, `maxLength?`): `string`

Defined in: [packages/morpho-ts/src/format/string.ts:15](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/format/string.ts#L15)

Shortens a long string by keeping both ends and inserting an ellipsis.

## Parameters

### str

`string`

String to shorten.

### maxLength?

`number`

Optional maximum output length. Returns `str` unchanged when omitted.

## Returns

`string`

The original string or an ellipsis-shortened string no longer than `maxLength`.

## Example

```ts
import { formatLongString } from "@morpho-org/morpho-ts";

const value = formatLongString("0x1234567890", 8);
// "0x1...90"
```
