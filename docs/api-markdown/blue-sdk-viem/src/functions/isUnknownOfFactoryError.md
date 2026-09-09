[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / isUnknownOfFactoryError

# Function: isUnknownOfFactoryError()

> **isUnknownOfFactoryError**(`error`): `boolean`

Defined in: [packages/blue-sdk-viem/src/error.ts:61](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/error.ts#L61)

Checks if an error is a contract revert with the "UnknownOfFactory" error name.

Used to propagate factory validation errors instead of falling back to multicall.

## Parameters

### error

`unknown`

Error thrown by viem or another read path.

## Returns

`boolean`

`true` when `error` wraps a viem `ContractFunctionRevertedError` named
  `UnknownOfFactory`.

## Example

```ts
import { isUnknownOfFactoryError } from "@morpho-org/blue-sdk-viem";

if (isUnknownOfFactoryError(error)) throw error;
```
