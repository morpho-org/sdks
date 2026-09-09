[**@morpho-org/sdks**](../../../../../README.md)

***

[@morpho-org/sdks](../../../../../README.md) / [morpho-ts/src](../../../README.md) / [Time](../README.md) / wait

# Function: wait()

> **wait**\<`T`\>(`ms`, `value?`): `Promise`\<`unknown`\>

Defined in: [packages/morpho-ts/src/time/time.ts:164](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/time/time.ts#L164)

Resolves a value after waiting for a duration in milliseconds.

## Type Parameters

### T

`T`

## Parameters

### ms

`number`

Duration to wait in milliseconds.

### value?

`T`

Optional value resolved by the returned promise.

## Returns

`Promise`\<`unknown`\>

A promise that resolves with `value` after the wait duration.

## Example

```ts
import { Time } from "@morpho-org/morpho-ts";

const value = await Time.wait(10, "ready");
// "ready"
```
