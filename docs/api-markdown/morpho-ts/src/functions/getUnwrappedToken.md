[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / getUnwrappedToken

# Function: getUnwrappedToken()

> **getUnwrappedToken**(`wrappedToken`, `chainId`): `` `0x${string}` `` \| `undefined`

Defined in: [packages/morpho-ts/src/addresses.ts:2353](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L2353)

Returns the unwrapped token mapped to a wrapped token on a chain.

## Parameters

### wrappedToken

`` `0x${string}` ``

The wrapped token address to resolve.

### chainId

`number`

The EIP-155 chain id.

## Returns

`` `0x${string}` `` \| `undefined`

The unwrapped token address, or `undefined` when no mapping is registered.

## Example

```ts
import { ChainId, getUnwrappedToken, NATIVE_ADDRESS, addresses } from "@morpho-org/morpho-ts";

const unwrapped = getUnwrappedToken(addresses[ChainId.EthMainnet].wNative!, ChainId.EthMainnet);
// unwrapped === NATIVE_ADDRESS
```
