[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / filterDefined

# Function: filterDefined()

Removes nullish values from an array.

## Param

**array**

Array to filter.

## Example

```ts
import { filterDefined } from "@morpho-org/morpho-ts";

const values = filterDefined([1, null, undefined, 2]);
// [1, 2]
```

## Call Signature

> **filterDefined**\<`T`\>(`array`): \[`T`, `...T[]`\]

Defined in: [packages/morpho-ts/src/utils.ts:431](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/utils.ts#L431)

Removes nullish values from a non-empty tuple.

### Type Parameters

#### T

`T`

### Parameters

#### array

\[`T`, ...(T \| null \| undefined)\[\]\]

Non-empty tuple to filter.

### Returns

\[`T`, `...T[]`\]

A non-empty tuple containing only defined values.

### Example

```ts
import { filterDefined } from "@morpho-org/morpho-ts";

const values = filterDefined([1, null, 2]);
// [1, 2]
```

## Call Signature

> **filterDefined**\<`T`\>(`array`): `T`[]

Defined in: [packages/morpho-ts/src/utils.ts:448](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/utils.ts#L448)

Removes nullish values from an array.

### Type Parameters

#### T

`T`

### Parameters

#### array

(`T` \| `null` \| `undefined`)[]

Array to filter.

### Returns

`T`[]

An array containing only defined values.

### Example

```ts
import { filterDefined } from "@morpho-org/morpho-ts";

const values = filterDefined([1, null, undefined, 2]);
// [1, 2]
```
