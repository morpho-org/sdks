[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [midnight-sdk/src](../../../README.md) / [TickLib](../README.md) / divHalfDownUnchecked

# Function: divHalfDownUnchecked()

> **divHalfDownUnchecked**(`x`, `d`): `bigint`

Defined in: [packages/midnight-sdk/src/math/TickLib.ts:81](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/math/TickLib.ts#L81)

Divides with half-down rounding without validating the denominator.

## Parameters

### x

`bigint`

Dividend.

### d

`bigint`

Divisor.

## Returns

`bigint`

Quotient rounded half down.

## Example

```ts
import { TickLib } from "@morpho-org/midnight-sdk";

const value = TickLib.divHalfDownUnchecked(5n, 2n);
console.log(value);
```
