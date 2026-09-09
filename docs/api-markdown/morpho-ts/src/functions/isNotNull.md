[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / isNotNull

# Function: isNotNull()

> **isNotNull**\<`T`\>(`v`): `v is T`

Defined in: [packages/morpho-ts/src/utils.ts:39](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/utils.ts#L39)

Narrows a nullable value to its non-null type.

## Type Parameters

### T

`T`

## Parameters

### v

`T` \| `null`

Value to test.

## Returns

`v is T`

`true` when `v` is not `null`.

## Example

```ts
import { isNotNull } from "@morpho-org/morpho-ts";

const values = [1, null, 2].filter(isNotNull);
// values satisfies number[]
```
