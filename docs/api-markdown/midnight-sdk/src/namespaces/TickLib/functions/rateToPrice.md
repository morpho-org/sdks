[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [TickLib](../README.md) / rateToPrice

# Function: rateToPrice()

> **rateToPrice**(`rate`): `bigint`

Defined in: [packages/midnight-sdk/src/math/TickLib.ts:246](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/math/TickLib.ts#L246)

Converts a WAD fixed rate into a WAD zero-coupon price.

This is an SDK-only rate conversion convenience.

## Parameters

### rate

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

WAD fixed rate.

## Returns

`bigint`

WAD price rounded down.

## Throws

when `rate` is negative.

## Example

```ts
import { TickLib } from "@morpho-org/midnight-sdk";

const price = TickLib.rateToPrice(50000000000000000n);
console.log(price);
```
