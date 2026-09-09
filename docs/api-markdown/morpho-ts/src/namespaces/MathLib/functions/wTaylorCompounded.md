[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [morpho-ts/src](../../../README.md) / [MathLib](../README.md) / wTaylorCompounded

# Function: wTaylorCompounded()

> **wTaylorCompounded**(`x`, `n`): `bigint`

Defined in: [packages/morpho-ts/src/math.ts:269](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/math.ts#L269)

Approximates a continuously compounded interest rate using Taylor expansion.

## Parameters

### x

[`BigIntish`](../../../type-aliases/BigIntish.md)

The base of the exponent accepted by `BigInt`.

### n

[`BigIntish`](../../../type-aliases/BigIntish.md)

The exponent accepted by `BigInt`.

## Returns

`bigint`

The WAD-scaled compounded rate approximation.

## Throws

When `BigInt` cannot convert an input.
