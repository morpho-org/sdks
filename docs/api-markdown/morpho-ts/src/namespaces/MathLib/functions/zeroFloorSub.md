[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [morpho-ts/src](../../../README.md) / [MathLib](../README.md) / zeroFloorSub

# Function: zeroFloorSub()

> **zeroFloorSub**(`x`, `y`): `bigint`

Defined in: [packages/morpho-ts/src/math.ts:97](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/math.ts#L97)

Returns `x - y`, floored to zero when `y` is greater than or equal to `x`.

## Parameters

### x

[`BigIntish`](../../../type-aliases/BigIntish.md)

Minuend accepted by `BigInt`.

### y

[`BigIntish`](../../../type-aliases/BigIntish.md)

Subtrahend accepted by `BigInt`.

## Returns

`bigint`

The non-negative difference.

## Throws

When `BigInt` cannot convert an input.
