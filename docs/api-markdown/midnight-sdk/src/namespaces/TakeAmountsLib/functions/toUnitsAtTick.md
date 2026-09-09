[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [TakeAmountsLib](../README.md) / toUnitsAtTick

# Function: toUnitsAtTick()

> **toUnitsAtTick**(`params`): `bigint`

Defined in: [packages/midnight-sdk/src/math/TakeAmountsLib.ts:236](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/math/TakeAmountsLib.ts#L236)

Converts assets to units at a tick price.

This is an SDK-only tick-priced conversion convenience.

## Parameters

### params

#### assets

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

Asset amount to convert.

#### rounding

[`RoundingDirection`](../../../../../morpho-ts/src/type-aliases/RoundingDirection.md)

Rounding direction applied by the fixed-point conversion.

#### tick

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

Offer tick whose price is used for the conversion.

## Returns

`bigint`

Units.

## Throws

when `assets` or `tick` is negative.

## Throws

when the tick price is zero.

## Throws

when `tick` exceeds `MAX_TICK`.

## Example

```ts
import { TakeAmountsLib } from "@morpho-org/midnight-sdk";

const units = TakeAmountsLib.toUnitsAtTick({ assets: 100n, tick: 6744n, rounding: "Down" });
console.log(units);
```
