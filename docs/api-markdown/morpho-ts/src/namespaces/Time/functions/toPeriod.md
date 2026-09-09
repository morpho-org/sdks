[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [morpho-ts/src](../../../README.md) / [Time](../README.md) / toPeriod

# Function: toPeriod()

> **toPeriod**(`periodLike`): `TPeriod`

Defined in: [packages/morpho-ts/src/time/time.ts:142](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/time/time.ts#L142)

Normalizes a period-like value into object form.

## Parameters

### periodLike

[`PeriodLike`](../type-aliases/PeriodLike.md)

Unit shorthand or full period object to normalize.

## Returns

`TPeriod`

A period object with `unit` and `duration`.

## Example

```ts
import { Time } from "@morpho-org/morpho-ts";

const period = Time.toPeriod("d");
// { unit: "d", duration: 1 }
```
