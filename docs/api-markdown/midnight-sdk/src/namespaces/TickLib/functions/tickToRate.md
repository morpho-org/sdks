[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [TickLib](../README.md) / tickToRate

# Function: tickToRate()

> **tickToRate**(`tick`): `bigint`

Defined in: [packages/midnight-sdk/src/math/TickLib.ts:276](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/math/TickLib.ts#L276)

Converts a Midnight tick into a WAD fixed rate.

This is an SDK-only rate conversion convenience.

## Parameters

### tick

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

Midnight tick.

## Returns

`bigint`

WAD fixed rate rounded up.

## Throws

when `tick` is negative.

## Throws

when `tick` exceeds `MAX_TICK`.

## Throws

when the tick price is zero.

## Example

```ts
import { TickLib } from "@morpho-org/midnight-sdk";

const rate = TickLib.tickToRate(6744n);
console.log(rate);
```
