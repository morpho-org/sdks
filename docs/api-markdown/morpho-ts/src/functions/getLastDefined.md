[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / getLastDefined

# Function: getLastDefined()

Returns the last defined item from an array.

## Param

**array**

Array to read from.

## Example

```ts
import { getLastDefined } from "@morpho-org/morpho-ts";

const value = getLastDefined([1, null, 2]);
// 2
```

## Call Signature

> **getLastDefined**\<`T`\>(`array`): `T`

Defined in: [packages/morpho-ts/src/utils.ts:480](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/utils.ts#L480)

Returns the last defined item from a non-empty tuple.

### Type Parameters

#### T

`T`

### Parameters

#### array

\[`T`, ...(T \| null \| undefined)\[\]\]

Non-empty tuple to read from.

### Returns

`T`

The last item after nullish values are removed.

### Example

```ts
import { getLastDefined } from "@morpho-org/morpho-ts";

const value = getLastDefined([1, null, 2]);
// 2
```

## Call Signature

> **getLastDefined**\<`T`\>(`array`): `T` \| `undefined`

Defined in: [packages/morpho-ts/src/utils.ts:495](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/utils.ts#L495)

Returns the last defined item from an array.

### Type Parameters

#### T

`T`

### Parameters

#### array

(`T` \| `null` \| `undefined`)[]

Array to read from.

### Returns

`T` \| `undefined`

The last defined item, or `undefined` when no item is defined.

### Example

```ts
import { getLastDefined } from "@morpho-org/morpho-ts";

const value = getLastDefined([1, null, 2]);
// 2
```
