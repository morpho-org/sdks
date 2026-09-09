[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [TickLib](../README.md) / assertTickInRange

# Function: assertTickInRange()

> **assertTickInRange**(`tick`): `bigint`

Defined in: [packages/midnight-sdk/src/math/TickLib.ts:99](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/math/TickLib.ts#L99)

Asserts that a tick is non-negative and within Midnight's deployed range.

## Parameters

### tick

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

Tick to validate.

## Returns

`bigint`

Tick as a bigint.

## Throws

when `tick` is negative.

## Throws

when `tick` exceeds `MAX_TICK`.

## Example

```ts
import { TickLib } from "@morpho-org/midnight-sdk";

const tick = TickLib.assertTickInRange(100n);
console.log(tick);
```
