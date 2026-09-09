[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / isNotUndefined

# Function: isNotUndefined()

> **isNotUndefined**\<`T`\>(`v`): `v is T`

Defined in: [packages/morpho-ts/src/utils.ts:54](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/utils.ts#L54)

Narrows an optional value to its non-undefined type.

## Type Parameters

### T

`T`

## Parameters

### v

`T` \| `undefined`

Value to test.

## Returns

`v is T`

`true` when `v` is not `undefined`.

## Example

```ts
import { isNotUndefined } from "@morpho-org/morpho-ts";

const values = [1, undefined, 2].filter(isNotUndefined);
// values satisfies number[]
```
