[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / transformValue

# Function: transformValue()

> **transformValue**\<`T`, `R`\>(`value`, `_transform`): `R` \| `null` \| `undefined`

Defined in: [packages/morpho-ts/src/utils.ts:196](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/utils.ts#L196)

Applies a transform to a defined value while preserving nullish inputs.

## Type Parameters

### T

`T`

### R

`R`

## Parameters

### value

`T` \| `null` \| `undefined`

Value to transform.

### \_transform

(`v`) => `R`

Transform applied only when `value` is defined.

## Returns

`R` \| `null` \| `undefined`

The transformed value, or the original `null` or `undefined` input.

## Example

```ts
import { transformValue } from "@morpho-org/morpho-ts";

const value = transformValue(2, (x) => x * 3);
// 6
```
