[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [morpho-ts/src](../../../README.md) / [Time](../README.md) / timestamp

# Function: timestamp()

> **timestamp**(): `bigint`

Defined in: [packages/morpho-ts/src/time/time.ts:180](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/time/time.ts#L180)

Returns the current Unix timestamp rounded up to the next second.

## Returns

`bigint`

The current Unix timestamp as a bigint.

## Example

```ts
import { Time } from "@morpho-org/morpho-ts";

const now = Time.timestamp();
// now satisfies bigint
```
