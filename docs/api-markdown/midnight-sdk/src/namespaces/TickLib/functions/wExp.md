[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [TickLib](../README.md) / wExp

# Function: wExp()

> **wExp**(`x`): `bigint`

Defined in: [packages/midnight-sdk/src/math/TickLib.ts:121](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/math/TickLib.ts#L121)

Computes the WAD-scaled exponential approximation used by Midnight ticks.

## Parameters

### x

`bigint`

WAD-scaled exponent.

## Returns

`bigint`

WAD-scaled exponential value.

## Example

```ts
import { TickLib } from "@morpho-org/midnight-sdk";

const value = TickLib.wExp(0n);
console.log(value);
```
