[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [TickLib](../README.md) / assertTickAlignedToSpacing

# Function: assertTickAlignedToSpacing()

> **assertTickAlignedToSpacing**(`tick`, `spacing?`): `bigint`

Defined in: [packages/midnight-sdk/src/math/TickLib.ts:340](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/math/TickLib.ts#L340)

Asserts that a tick is aligned to the provided spacing.

This is an SDK-only tick-domain assertion.

## Parameters

### tick

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md)

Tick to validate.

### spacing?

[`BigIntish`](../../../../../morpho-ts/src/type-aliases/BigIntish.md) = `DEFAULT_TICK_SPACING`

Market tick spacing.

## Returns

`bigint`

Tick as a bigint.

## Throws

when `tick` is negative.

## Throws

when `tick` exceeds `MAX_TICK`.

## Throws

when spacing is invalid or the tick is not aligned.

## Example

```ts
import { TickLib } from "@morpho-org/midnight-sdk";

TickLib.assertTickAlignedToSpacing(100n, 4n);
```
