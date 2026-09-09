[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / formatEnumeration

# Function: formatEnumeration()

> **formatEnumeration**(`items`): `string`

Defined in: [packages/morpho-ts/src/format/array.ts:48](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/format/array.ts#L48)

Humanizes an array of strings into a comma-separated list with an "and" before the last item.
For example, ["a", "b", "c"] becomes "a, b and c".

## Parameters

### items

`string`[]

Array of strings

## Returns

`string`

Humanized enumeration

## Example

```ts
import { formatEnumeration } from "@morpho-org/morpho-ts";

const value = formatEnumeration(["supply", "borrow", "withdraw"]);
// "supply, borrow and withdraw"
```
