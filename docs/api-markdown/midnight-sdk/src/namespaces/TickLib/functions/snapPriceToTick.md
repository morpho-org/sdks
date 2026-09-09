[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [TickLib](../README.md) / snapPriceToTick

# Function: snapPriceToTick()

> **snapPriceToTick**(`price`, `spacing?`): `bigint`

Defined in: [packages/midnight-sdk/src/math/TickLib.ts:223](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/math/TickLib.ts#L223)

Snaps a WAD price to the price of the lowest spacing-aligned tick at or above it.

This is an SDK-only convenience around `priceToTick` and `tickToPrice`.

## Parameters

### price

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

WAD price.

### spacing?

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md) = `DEFAULT_TICK_SPACING`

Tick spacing.

## Returns

`bigint`

Snapped WAD price.

## Throws

when `price` is negative.

## Throws

when price is above WAD.

## Throws

when spacing is invalid.

## Example

```ts
import { TickLib } from "@morpho-org/midnight-sdk";

const price = TickLib.snapPriceToTick(500000000000000000n, 4n);
console.log(price);
```
