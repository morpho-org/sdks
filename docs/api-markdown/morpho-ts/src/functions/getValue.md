[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / getValue

# Function: getValue()

> **getValue**\<`T`, `Path`\>(`data`, `path`): [`FieldType`](../type-aliases/FieldType.md)\<`T`, `Path`\>

Defined in: [packages/morpho-ts/src/utils.ts:174](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/utils.ts#L174)

Reads a value from an object by a dot-separated path.

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

[`FieldType`](../type-aliases/FieldType.md)\<`T`, `Path`\>

The value resolved at `path`, preserving nullish values from the input.

## Example

```ts
import { getValue } from "@morpho-org/morpho-ts";

const value = getValue({ user: { name: "Ada" } }, "user.name");
// "Ada"
```
