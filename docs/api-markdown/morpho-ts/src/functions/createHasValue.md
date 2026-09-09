[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / createHasValue

# Function: createHasValue()

> **createHasValue**\<`T`, `Path`\>(`path`): (`data`) => `data is T & { [path in string]: NonNullable<FieldType<T, path>> }`

Defined in: [packages/morpho-ts/src/utils.ts:156](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/utils.ts#L156)

Creates a reusable non-nullish path predicate.

## Type Parameters

### T

`T`

### Path

`Path` *extends* `string` = [`PartialDottedKeys`](../type-aliases/PartialDottedKeys.md)\<`T`\>

## Parameters

### path

`Path`

Dot-separated path the returned predicate reads.

## Returns

A predicate that narrows objects whose value at `path` is defined.

(`data`) => `data is T & { [path in string]: NonNullable<FieldType<T, path>> }`

## Example

```ts
import { createHasValue } from "@morpho-org/morpho-ts";

const hasName = createHasValue<{ user: { name?: string } }>("user.name");
const result = [{ user: {} }, { user: { name: "Ada" } }].filter(hasName);
// [{ user: { name: "Ada" } }]
```
