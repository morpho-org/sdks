[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [morpho-ts/src](../../../README.md) / [MathLib](../README.md) / wMul

# Function: wMul()

> **wMul**(`x`, `y`, `rounding`): `bigint`

Defined in: [packages/morpho-ts/src/math.ts:138](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/math.ts#L138)

Performs the WAD-based multiplication of two numbers with a rounding direction.

## Parameters

### x

[`BigIntish`](../../../type-aliases/BigIntish.md)

The first number accepted by `BigInt`.

### y

[`BigIntish`](../../../type-aliases/BigIntish.md)

The second number accepted by `BigInt`.

### rounding

[`RoundingDirection`](../../../type-aliases/RoundingDirection.md)

Rounding direction.

## Returns

`bigint`

The rounded WAD product.

## Throws

When `BigInt` cannot convert an input.
