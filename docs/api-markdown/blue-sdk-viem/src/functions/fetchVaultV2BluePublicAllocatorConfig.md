[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / fetchVaultV2BluePublicAllocatorConfig

# Function: fetchVaultV2BluePublicAllocatorConfig()

> **fetchVaultV2BluePublicAllocatorConfig**(`vault`, `client`, `parameters?`): `Promise`\<[`VaultV2BluePublicAllocatorConfig`](../../../blue-sdk/src/classes/VaultV2BluePublicAllocatorConfig.md)\>

Defined in: [packages/blue-sdk-viem/src/fetch/vault-v2/VaultV2BluePublicAllocatorConfig.ts:53](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/fetch/vault-v2/VaultV2BluePublicAllocatorConfig.ts#L53)

Fetches a Vault V2's BluePublicAllocator-wide configuration.

## Parameters

### vault

`` `0x${string}` ``

Vault V2 address.

### client

`Client`

Viem client used for the contract read.

### parameters?

[`FetchParameters`](../type-aliases/FetchParameters.md) = `{}`

## Returns

`Promise`\<[`VaultV2BluePublicAllocatorConfig`](../../../blue-sdk/src/classes/VaultV2BluePublicAllocatorConfig.md)\>

Hydrated vault allocator configuration with penalty calculations.

## Throws

when the chain has no BluePublicAllocator deployment.

## Throws

when the chain is absent from the address registry.

## Throws

when the contract read fails.

## Example

```ts
import type { VaultV2BluePublicAllocatorConfig } from "@morpho-org/blue-sdk";
import { fetchVaultV2BluePublicAllocatorConfig } from "@morpho-org/blue-sdk-viem";
import { type Address, createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const client = createPublicClient({ chain: mainnet, transport: http() });
export async function fetchAllocatorConfig(
  vault: Address,
): Promise<VaultV2BluePublicAllocatorConfig> {
  return fetchVaultV2BluePublicAllocatorConfig(vault, client);
}
```
