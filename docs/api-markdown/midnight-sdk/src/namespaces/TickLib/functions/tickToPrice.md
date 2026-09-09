[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [TickLib](../README.md) / tickToPrice

# Function: tickToPrice()

> **tickToPrice**(`tick`): `bigint`

Defined in: [packages/midnight-sdk/src/math/TickLib.ts:148](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/math/TickLib.ts#L148)

Converts a Midnight tick into a WAD price.

## Parameters

### tick

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

Tick in the deployed range.

## Returns

`bigint`

WAD price rounded to `PRICE_ROUNDING_STEP`.

## Throws

when `tick` is negative.

## Throws

when `tick` exceeds `MAX_TICK`.

## Example

```ts
import { TickLib } from "@morpho-org/midnight-sdk";

const price = TickLib.tickToPrice(6744n);
console.log(price);
```
