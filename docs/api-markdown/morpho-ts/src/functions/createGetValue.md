[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / createGetValue

# Function: createGetValue()

> **createGetValue**\<`T`, `Path`\>(`path`): (`data`) => [`FieldType`](../type-aliases/FieldType.md)\<`T`, `Path`\>

Defined in: [packages/morpho-ts/src/utils.ts:216](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/utils.ts#L216)

Creates a reusable getter for a dot-separated path.

## Type Parameters

### T

`T`

### Path

`Path` *extends* `string` = [`PartialDottedKeys`](../type-aliases/PartialDottedKeys.md)\<`T`\>

## Parameters

### path

`Path`

Dot-separated path the returned getter reads.

## Returns

A getter that reads the value at `path` from an object.

(`data`) => [`FieldType`](../type-aliases/FieldType.md)\<`T`, `Path`\>

## Example

```ts
import { createGetValue } from "@morpho-org/morpho-ts";

const getName = createGetValue<{ user: { name: string } }>("user.name");
const value = getName({ user: { name: "Ada" } });
// "Ada"
```
