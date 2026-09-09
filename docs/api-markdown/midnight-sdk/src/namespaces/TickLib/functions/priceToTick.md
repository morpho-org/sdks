[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [TickLib](../README.md) / priceToTick

# Function: priceToTick()

> **priceToTick**(`price`, `spacing?`): `bigint`

Defined in: [packages/midnight-sdk/src/math/TickLib.ts:179](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/math/TickLib.ts#L179)

Converts a WAD price into the lowest spacing-aligned tick whose price is at least the input.

## Parameters

### price

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

WAD price.

### spacing?

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md) = `DEFAULT_TICK_SPACING`

Tick spacing; defaults to `DEFAULT_TICK_SPACING`.

## Returns

`bigint`

Lowest aligned tick with price greater than or equal to `price`.

## Throws

when `price` is negative.

## Throws

when price is above WAD.

## Throws

when spacing is invalid.

## Example

```ts
import { TickLib } from "@morpho-org/midnight-sdk";

const tick = TickLib.priceToTick(500000000000000000n);
console.log(tick);
```
