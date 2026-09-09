[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-ts/src](../README.md) / getPermissionedCoinbaseTokens

# Function: getPermissionedCoinbaseTokens()

> **getPermissionedCoinbaseTokens**(`chainId`): `Set`\<`` `0x${string}` ``\>

Defined in: [packages/morpho-ts/src/addresses.ts:2409](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-ts/src/addresses.ts#L2409)

Returns the known Coinbase-attested wrapped tokens for a chain.

## Parameters

### chainId

`number`

The EIP-155 chain id.

## Returns

`Set`\<`` `0x${string}` ``\>

A set of permissioned wrapped token addresses, or an empty set when none are registered.

## Example

```ts
import { ChainId, getPermissionedCoinbaseTokens } from "@morpho-org/morpho-ts";

const tokens = getPermissionedCoinbaseTokens(ChainId.BaseMainnet);
// tokens satisfies Set<`0x${string}`>
```
