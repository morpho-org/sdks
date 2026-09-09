[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / formatUnion

# Function: formatUnion()

> **formatUnion**(`items`): `string`

Defined in: [packages/morpho-ts/src/format/array.ts:30](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/format/array.ts#L30)

Humanizes an array of strings into a comma-separated list with an "or" before the last item.
For example, ["a", "b", "c"] becomes "a, b or c".

## Parameters

### items

`string`[]

Array of strings

## Returns

`string`

Humanized union

## Example

```ts
import { formatUnion } from "@morpho-org/morpho-ts";

const value = formatUnion(["supply", "borrow", "withdraw"]);
// "supply, borrow or withdraw"
```
