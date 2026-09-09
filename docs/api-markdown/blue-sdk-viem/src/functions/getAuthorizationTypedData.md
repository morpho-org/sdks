[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / getAuthorizationTypedData

# Function: getAuthorizationTypedData()

> **getAuthorizationTypedData**(`args`, `chainId`): `MessageDefinition`\<\{ `Authorization`: `object`[]; \}, `"Authorization"`\>

Defined in: [packages/blue-sdk-viem/src/signatures/manager.ts:46](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/signatures/manager.ts#L46)

Builds Morpho Blue manager authorization typed data for signing.

## Parameters

### args

[`AuthorizationArgs`](../interfaces/AuthorizationArgs.md)

Authorization message fields.

### chainId

[`ChainId`](../../../morpho-ts/src/enumerations/ChainId.md)

Chain id whose Morpho Blue deployment verifies the signature.

## Returns

`MessageDefinition`\<\{ `Authorization`: `object`[]; \}, `"Authorization"`\>

Typed data ready to pass to a wallet for signing.

## Example

```ts
import { ChainId } from "@morpho-org/blue-sdk";
import { getAuthorizationTypedData } from "@morpho-org/blue-sdk-viem";

const typedData = getAuthorizationTypedData(
  {
    authorizer: "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb",
    authorized: "0x6566194141fF46b819c55E7137D8329898eCd06C",
    isAuthorized: true,
    nonce: 0n,
    deadline: 1_900_000_000n,
  },
  ChainId.EthMainnet,
);
```
