[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / keys

# Function: keys()

> **keys**\<`T`\>(`o?`): `T` *extends* `ArrayLike`\<`unknown`\> ? `` `${number}` `` : `` `${Extract<keyof T, number>}` `` \| `Extract`\<keyof `T`, `string`\>[]

Defined in: [packages/morpho-ts/src/utils.ts:233](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/utils.ts#L233)

Returns object keys with a typed key union.

## Type Parameters

### T

`T`

## Parameters

### o?

`T`

Optional object to read keys from.

## Returns

`T` *extends* `ArrayLike`\<`unknown`\> ? `` `${number}` `` : `` `${Extract<keyof T, number>}` `` \| `Extract`\<keyof `T`, `string`\>[]

The object's enumerable own property keys, or an empty array for nullish input.

## Example

```ts
import { keys } from "@morpho-org/morpho-ts";

const result = keys({ a: 1, b: 2 });
// ["a", "b"]
```
