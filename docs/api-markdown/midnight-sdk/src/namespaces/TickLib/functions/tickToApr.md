[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [TickLib](../README.md) / tickToApr

# Function: tickToApr()

> **tickToApr**(`tick`, `timeToMaturity`): `bigint`

Defined in: [packages/midnight-sdk/src/math/TickLib.ts:304](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/math/TickLib.ts#L304)

Converts a Midnight tick into a WAD simple annual percentage rate.

This is an SDK-only rate display convenience. It annualizes the fixed
period rate from [tickToRate](tickToRate.md) over `timeToMaturity` seconds.

## Parameters

### tick

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

Midnight tick.

### timeToMaturity

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

Seconds until the market matures.

## Returns

`bigint`

WAD simple APR rounded up.

## Throws

when `tick` or `timeToMaturity` is negative.

## Throws

when `tick` exceeds `MAX_TICK`.

## Throws

when the tick price or `timeToMaturity` is zero.

## Example

```ts
import { TickLib } from "@morpho-org/midnight-sdk";
import { Time } from "@morpho-org/morpho-ts";

const apr = TickLib.tickToApr(6744n, Time.s.from.y(1n));
console.log(apr);
```
