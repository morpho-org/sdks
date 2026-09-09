[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / mergeEntries

# Function: mergeEntries()

> **mergeEntries**\<`K`, `T`\>(`srcEntries`, `merger`): `Record`\<`K`, `T`\>

Defined in: [packages/morpho-ts/src/utils.ts:309](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/utils.ts#L309)

Builds a record from entries, merging duplicate keys.

## Type Parameters

### K

`K` *extends* `PropertyKey`

### T

`T`

## Parameters

### srcEntries

`Iterable`\<readonly \[`K`, `T`\]\>

Iterable of key-value entries.

### merger

(`prev`, `value`) => `T`

Combines the previous value with a duplicate value.

## Returns

`Record`\<`K`, `T`\>

A record containing the merged entries.

## Example

```ts
import { mergeEntries } from "@morpho-org/morpho-ts";

const result = mergeEntries(
  [["a", 1], ["a", 2]],
  (prev, value) => prev + value,
);
// { a: 3 }
```
