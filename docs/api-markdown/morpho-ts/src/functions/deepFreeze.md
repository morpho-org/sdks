[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / deepFreeze

# Function: deepFreeze()

> **deepFreeze**\<`T`\>(`obj`): `T`

Defined in: [packages/morpho-ts/src/utils.ts:546](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/utils.ts#L546)

Recursively freezes an object and its nested object properties.

## Type Parameters

### T

`T`

## Parameters

### obj

`T`

Object to freeze recursively.

## Returns

`T`

The same object reference after recursive freezing.

## Example

```ts
import { deepFreeze } from "@morpho-org/morpho-ts";

const value = deepFreeze({ nested: { amount: 1n } });
// Object.isFrozen(value) === true
```
