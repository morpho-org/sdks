[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / getLast

# Function: getLast()

Returns the last item from an array.

## Param

**array**

Array to read from.

## Example

```ts
import { getLast } from "@morpho-org/morpho-ts";

const value = getLast([1, 2, 3]);
// 3
```

## Call Signature

> **getLast**\<`T`\>(`array`): `T`

Defined in: [packages/morpho-ts/src/utils.ts:384](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/utils.ts#L384)

Returns the last item from a non-empty tuple.

### Type Parameters

#### T

`T`

### Parameters

#### array

\[`T`, ...(T \| null \| undefined)\[\]\]

Non-empty tuple to read from.

### Returns

`T`

The last tuple item.

### Example

```ts
import { getLast } from "@morpho-org/morpho-ts";

const value = getLast([1, 2, 3]);
// 3
```

## Call Signature

> **getLast**\<`T`\>(`array`): `T` \| `undefined`

Defined in: [packages/morpho-ts/src/utils.ts:399](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/utils.ts#L399)

Returns the last item from an array.

### Type Parameters

#### T

`T`

### Parameters

#### array

`T`[]

Array to read from.

### Returns

`T` \| `undefined`

The last array item, or `undefined` when the array is empty.

### Example

```ts
import { getLast } from "@morpho-org/morpho-ts";

const value = getLast([1, 2, 3]);
// 3
```
