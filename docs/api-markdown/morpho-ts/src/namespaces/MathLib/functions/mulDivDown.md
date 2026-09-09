[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [morpho-ts/src](../../../README.md) / [MathLib](../README.md) / mulDivDown

# Function: mulDivDown()

> **mulDivDown**(`x`, `y`, `denominator`): `bigint`

Defined in: [packages/morpho-ts/src/math.ts:202](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/math.ts#L202)

Multiplies two numbers and divides by a denominator, rounding down the result.

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

## Returns

`bigint`

The rounded-down quotient.

## Throws

DivisionByZeroError when `denominator` is zero.

## Throws

When `BigInt` cannot convert an input.
