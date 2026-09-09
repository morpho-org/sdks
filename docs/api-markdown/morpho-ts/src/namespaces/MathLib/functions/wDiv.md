[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [morpho-ts/src](../../../README.md) / [MathLib](../README.md) / wDiv

# Function: wDiv()

> **wDiv**(`x`, `y`, `rounding`): `bigint`

Defined in: [packages/morpho-ts/src/math.ts:183](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/math.ts#L183)

Performs the WAD-based division of two numbers with a rounding direction.

## Parameters

### x

[`BigIntish`](../../../type-aliases/BigIntish.md)

The numerator accepted by `BigInt`.

### y

[`BigIntish`](../../../type-aliases/BigIntish.md)

The denominator accepted by `BigInt`.

### rounding

[`RoundingDirection`](../../../type-aliases/RoundingDirection.md)

Rounding direction.

## Returns

`bigint`

The rounded WAD quotient.

## Throws

DivisionByZeroError when `y` is zero.

## Throws

When `BigInt` cannot convert an input.
