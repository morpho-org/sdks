[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / isDefined

# Function: isDefined()

> **isDefined**\<`T`\>(`v?`): `v is T`

Defined in: [packages/morpho-ts/src/utils.ts:69](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/utils.ts#L69)

Narrows a nullish value to its defined type.

## Type Parameters

### T

`T`

## Parameters

### v?

`T` \| `null`

Value to test.

## Returns

`v is T`

`true` when `v` is neither `null` nor `undefined`.

## Example

```ts
import { isDefined } from "@morpho-org/morpho-ts";

const values = [1, null, undefined, 2].filter(isDefined);
// values satisfies number[]
```
