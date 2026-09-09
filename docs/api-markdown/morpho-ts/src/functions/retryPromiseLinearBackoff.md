[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / retryPromiseLinearBackoff

# Function: retryPromiseLinearBackoff()

> **retryPromiseLinearBackoff**\<`R`\>(`func`, `options`): `Promise`\<`R`\>

Defined in: [packages/morpho-ts/src/utils.ts:344](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/utils.ts#L344)

Retries an asynchronous operation with a linear backoff delay.

## Type Parameters

### R

`R`

## Parameters

### func

() => `R`

Operation to execute until it succeeds or retries are exhausted.

### options

Optional retry settings.

#### onError?

(`error`, `index`) => `unknown`

Optional hook called after each failure. Return a truthy value to stop retrying.

#### retries?

`number` = `8`

Maximum number of retry attempts.

#### timeout?

`number` = `100`

Base delay in milliseconds multiplied by the retry attempt number.

## Returns

`Promise`\<`R`\>

The resolved operation result.

## Example

```ts
import { retryPromiseLinearBackoff } from "@morpho-org/morpho-ts";

const value = await retryPromiseLinearBackoff(async () => "ready", {
  retries: 2,
  timeout: 10,
});
// "ready"
```
