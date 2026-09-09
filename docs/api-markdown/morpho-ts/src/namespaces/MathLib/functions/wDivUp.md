[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [morpho-ts/src](../../../README.md) / [MathLib](../README.md) / wDivUp

# Function: wDivUp()

> **wDivUp**(`x`, `y`): `bigint`

Defined in: [packages/morpho-ts/src/math.ts:168](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/math.ts#L168)

Performs the WAD-based division of two numbers, rounded up.

## Parameters

### x

[`BigIntish`](../../../type-aliases/BigIntish.md)

The numerator accepted by `BigInt`.

### y

[`BigIntish`](../../../type-aliases/BigIntish.md)

The denominator accepted by `BigInt`.

## Returns

`bigint`

The rounded-up WAD quotient.

## Throws

DivisionByZeroError when `y` is zero.

## Throws

When `BigInt` cannot convert an input.
