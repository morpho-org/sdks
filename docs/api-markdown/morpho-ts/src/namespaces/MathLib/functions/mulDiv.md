[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [morpho-ts/src](../../../README.md) / [MathLib](../README.md) / mulDiv

# Function: mulDiv()

> **mulDiv**(`x`, `y`, `denominator`, `rounding`): `bigint`

Defined in: [packages/morpho-ts/src/math.ts:252](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/math.ts#L252)

Multiplies two numbers and divides by a denominator with a rounding direction.

## Parameters

### x

[`BigIntish`](../../../type-aliases/BigIntish.md)

The first number accepted by `BigInt`.

### y

[`BigIntish`](../../../type-aliases/BigIntish.md)

The second number accepted by `BigInt`.

### denominator

[`BigIntish`](../../../type-aliases/BigIntish.md)

The denominator accepted by `BigInt`.

### rounding

[`RoundingDirection`](../../../type-aliases/RoundingDirection.md)

Rounding direction.

## Returns

`bigint`

The rounded quotient.

## Throws

DivisionByZeroError when `denominator` is zero.

## Throws

When `BigInt` cannot convert an input.
