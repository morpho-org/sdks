[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / assertNonNegative

# Function: assertNonNegative()

> **assertNonNegative**(`field`, `value`): `void`

Defined in: [packages/morpho-ts/src/utils.ts:529](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/utils.ts#L529)

Asserts that a bigint value is non-negative.

## Parameters

### field

`string`

Field name used in the thrown error message.

### value

`bigint`

Bigint value to validate.

## Returns

`void`

## Throws

NegativeValueError when `value` is negative.

## Example

```ts
import { assertNonNegative } from "@morpho-org/morpho-ts";

assertNonNegative("assets", 0n);
```
