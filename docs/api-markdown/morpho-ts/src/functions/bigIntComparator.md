[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / bigIntComparator

# Function: bigIntComparator()

> **bigIntComparator**\<`T`\>(`getter`, `order?`): (`a`, `b`) => `-1` \| `0` \| `1`

Defined in: [packages/morpho-ts/src/utils.ts:88](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/utils.ts#L88)

Creates a comparator for sorting by nullable bigint keys.

## Type Parameters

### T

`T`

## Parameters

### getter

(`x`) => `bigint` \| `null` \| `undefined`

Reads the bigint sort key from an item.

### order?

`"asc"` \| `"desc"`

Optional sort order. Defaults to ascending.

## Returns

A comparator compatible with `Array.prototype.sort`.

(`a`, `b`) => `-1` \| `0` \| `1`

## Example

```ts
import { bigIntComparator } from "@morpho-org/morpho-ts";

const sorted = [{ value: 2n }, { value: 1n }].sort(
  bigIntComparator((item) => item.value),
);
// [{ value: 1n }, { value: 2n }]
```
