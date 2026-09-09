[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / isHexEqual

# Function: isHexEqual()

> **isHexEqual**(`left`, `right`): `boolean`

Defined in: [packages/morpho-ts/src/utils.ts:23](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/utils.ts#L23)

Compares hex strings case-insensitively.

## Parameters

### left

`string`

First hex string.

### right

`string`

Second hex string.

## Returns

`boolean`

Whether both hex strings are equal after lowercase normalization.

## Example

```ts
import { isHexEqual } from "@morpho-org/morpho-ts";

const equal = isHexEqual("0xAbC", "0xabc");
// true
```
