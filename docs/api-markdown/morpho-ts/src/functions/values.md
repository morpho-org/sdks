[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / values

# Function: values()

> **values**\<`T`\>(`o?`): `T` *extends* `ArrayLike`\<`U`\> ? `U` : `T`\[keyof `T`\][]

Defined in: [packages/morpho-ts/src/utils.ts:253](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/utils.ts#L253)

Returns object values with a typed value union.

## Type Parameters

### T

`T`

## Parameters

### o?

`T`

Optional object to read values from.

## Returns

`T` *extends* `ArrayLike`\<`U`\> ? `U` : `T`\[keyof `T`\][]

The object's enumerable own property values, or an empty array for nullish input.

## Example

```ts
import { values } from "@morpho-org/morpho-ts";

const result = values({ a: 1, b: 2 });
// [1, 2]
```
