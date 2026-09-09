[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / getUnsupportedVaultV2Adapter

# Function: getUnsupportedVaultV2Adapter()

> **getUnsupportedVaultV2Adapter**(`error`): `` `0x${string}` `` \| `null`

Defined in: [packages/blue-sdk-viem/src/error.ts:91](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/error.ts#L91)

Checks if an error is a contract revert with the "UnsupportedVaultV2Adapter"
error name, returning the offending adapter address if so. Used to propagate
adapter validation errors from the deployless `GetVaultV2.query` to the
caller as a typed UnsupportedVaultV2AdapterError.

## Parameters

### error

`unknown`

Error thrown by viem or another read path.

## Returns

`` `0x${string}` `` \| `null`

The unsupported adapter address when present, or `null` when the error does not match.

## Example

```ts
import { UnsupportedVaultV2AdapterError } from "@morpho-org/blue-sdk";
import { getUnsupportedVaultV2Adapter } from "@morpho-org/blue-sdk-viem";

const adapter = getUnsupportedVaultV2Adapter(error);
if (adapter != null) throw new UnsupportedVaultV2AdapterError(adapter);
```
