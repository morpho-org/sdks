[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / validateSlippageTolerance

# Function: validateSlippageTolerance()

> **validateSlippageTolerance**(`slippageTolerance`): `void`

Defined in: [packages/morpho-sdk/src/helpers/validate.ts:577](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/helpers/validate.ts#L577)

Validates that a slippage tolerance is within an acceptable range.

Throws [NegativeInputError](../classes/NegativeInputError.md) if negative.
Throws [ExcessiveSlippageToleranceError](../classes/ExcessiveSlippageToleranceError.md) if greater than [MAX\_SLIPPAGE\_TOLERANCE](../variables/MAX_SLIPPAGE_TOLERANCE.md).

## Parameters

### slippageTolerance

`bigint`

The slippage tolerance in WAD.

## Returns

`void`

Nothing when the slippage tolerance is valid.

## Throws

when `slippageTolerance < 0n`.

## Throws

when the tolerance exceeds the SDK maximum.

## Example

```ts
import { validateSlippageTolerance } from "@morpho-org/morpho-sdk";

const result: void = validateSlippageTolerance(5_000000000000000n);
```
