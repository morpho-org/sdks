[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [TakeAmountsLib](../README.md) / toUnits

# Function: toUnits()

> **toUnits**(`params`): `bigint`

Defined in: [packages/midnight-sdk/src/math/TakeAmountsLib.ts:202](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/math/TakeAmountsLib.ts#L202)

Converts assets to units at a WAD price.

This is an SDK-only generic conversion convenience.

## Parameters

### params

#### assets

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

Asset amount to convert.

#### price

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

WAD-scaled price used for the conversion.

#### rounding

[`RoundingDirection`](../../../../../morpho-ts/src/type-aliases/RoundingDirection.md)

Rounding direction applied by the fixed-point conversion.

## Returns

`bigint`

Units.

## Throws

when `assets` or `price` is negative.

## Throws

when price is zero.

## Example

```ts
import { MathLib } from "@morpho-org/morpho-ts";
import { TakeAmountsLib } from "@morpho-org/midnight-sdk";

const units = TakeAmountsLib.toUnits({ assets: 100n, price: MathLib.WAD, rounding: "Down" });
console.log(units);
```
