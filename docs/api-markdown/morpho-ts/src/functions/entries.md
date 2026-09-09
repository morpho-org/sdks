[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / entries

# Function: entries()

> **entries**\<`T`\>(`o?`): \[keyof `T`, `T` *extends* `ArrayLike`\<`U`\> ? `U` : `T`\[keyof `T`\]\][]

Defined in: [packages/morpho-ts/src/utils.ts:269](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/utils.ts#L269)

Returns object entries with typed keys and values.

## Type Parameters

### T

`T`

## Parameters

### o?

`T`

Optional object to read entries from.

## Returns

\[keyof `T`, `T` *extends* `ArrayLike`\<`U`\> ? `U` : `T`\[keyof `T`\]\][]

The object's enumerable own entries, or an empty array for nullish input.

## Example

```ts
import { entries } from "@morpho-org/morpho-ts";

const result = entries({ a: 1, b: 2 });
// [["a", 1], ["b", 2]]
```
