[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / fromEntries

# Function: fromEntries()

> **fromEntries**\<`K`, `T`\>(`srcEntries`): `Record`\<`K`, `T`\>

Defined in: [packages/morpho-ts/src/utils.ts:288](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/utils.ts#L288)

Builds a typed record from key-value entries.

## Type Parameters

### K

`K` *extends* `PropertyKey`

### T

`T`

## Parameters

### srcEntries

`Iterable`\<readonly \[`K`, `T`\]\>

Iterable of key-value entries.

## Returns

`Record`\<`K`, `T`\>

A record containing the provided entries.

## Example

```ts
import { fromEntries } from "@morpho-org/morpho-ts";

const result = fromEntries([["a", 1]]);
// { a: 1 }
```
