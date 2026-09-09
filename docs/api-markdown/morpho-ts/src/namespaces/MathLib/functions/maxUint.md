[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [morpho-ts/src](../../../README.md) / [MathLib](../README.md) / maxUint

# Function: maxUint()

> **maxUint**(`nBits`): `bigint`

Defined in: [packages/morpho-ts/src/math.ts:48](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/math.ts#L48)

Returns `2 ** nBits - 1`.

## Parameters

### nBits

`number`

Nibble-aligned bit length.

## Returns

`bigint`

Maximum unsigned integer for the bit length.

## Throws

InvalidBitLengthError when `nBits` is not positive or not divisible by four.
