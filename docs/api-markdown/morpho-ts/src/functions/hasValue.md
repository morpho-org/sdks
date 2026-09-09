[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / hasValue

# Function: hasValue()

> **hasValue**\<`T`, `Path`\>(`data`, `path`): `data is T & { [path in string]: NonNullable<FieldType<T, path>> }`

Defined in: [packages/morpho-ts/src/utils.ts:132](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/utils.ts#L132)

Tests whether a dot-separated path resolves to a non-nullish value.

## Type Parameters

### T

`T`

### Path

`Path` *extends* `string` = [`PartialDottedKeys`](../type-aliases/PartialDottedKeys.md)\<`T`\>

## Parameters

### data

`T`

Object to inspect.

### path

`Path`

Dot-separated path to read from `data`.

## Returns

`data is T & { [path in string]: NonNullable<FieldType<T, path>> }`

`true` when the value at `path` is neither `null` nor `undefined`.

## Example

```ts
import { hasValue } from "@morpho-org/morpho-ts";

const data = { user: { name: "Ada" as string | null } };
const result = hasValue(data, "user.name");
// true
```
