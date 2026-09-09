[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [morpho-ts/src](../../../README.md) / [MathLib](../README.md) / mulDivUp

# Function: mulDivUp()

> **mulDivUp**(`x`, `y`, `denominator`): `bigint`

Defined in: [packages/morpho-ts/src/math.ts:227](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/math.ts#L227)

Multiplies two numbers and divides by a denominator, rounding up the result.

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

The rounded-up quotient.

## Throws

DivisionByZeroError when `denominator` is zero.

## Throws

When `BigInt` cannot convert an input.
