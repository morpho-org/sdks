[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / fetchVaultV2BlueMarketPublicAllocatorConfig

# Function: fetchVaultV2BlueMarketPublicAllocatorConfig()

> **fetchVaultV2BlueMarketPublicAllocatorConfig**(`vault`, `adapter`, `adapterMarketCapId`, `client`, `parameters?`): `Promise`\<[`VaultV2BlueMarketPublicAllocatorConfig`](../../../blue-sdk/src/classes/VaultV2BlueMarketPublicAllocatorConfig.md)\>

Defined in: [packages/blue-sdk-viem/src/fetch/vault-v2/VaultV2BlueMarketPublicAllocatorConfig.ts:49](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/fetch/vault-v2/VaultV2BlueMarketPublicAllocatorConfig.ts#L49)

Fetches BluePublicAllocator permission and cap state for one Vault V2 adapter-market pair.

## Parameters

### vault

`` `0x${string}` ``

Vault V2 address.

### adapter

`` `0x${string}` ``

MorphoMarketV1AdapterV2 address.

### adapterMarketCapId

`` `0x${string}` ``

Adapter-scoped market cap id.

### client

`Client`

Viem client used for contract reads.

### parameters?

[`FetchParameters`](../type-aliases/FetchParameters.md) = `{}`

## Returns

`Promise`\<[`VaultV2BlueMarketPublicAllocatorConfig`](../../../blue-sdk/src/classes/VaultV2BlueMarketPublicAllocatorConfig.md)\>

Hydrated adapter-market config with max-in calculation.

## Throws

when the chain has no BluePublicAllocator deployment.

## Throws

when the chain is absent from the address registry.

## Throws

when one of the contract reads fails.

## Example

```ts
import type { VaultV2BlueMarketPublicAllocatorConfig } from "@morpho-org/blue-sdk";
import { fetchVaultV2BlueMarketPublicAllocatorConfig } from "@morpho-org/blue-sdk-viem";
import { type Address, createPublicClient, type Hash, http } from "viem";
import { mainnet } from "viem/chains";

const client = createPublicClient({ chain: mainnet, transport: http() });
export async function fetchMarketAllocatorConfig(
  vault: Address,
  adapter: Address,
  adapterMarketCapId: Hash,
): Promise<VaultV2BlueMarketPublicAllocatorConfig> {
  return fetchVaultV2BlueMarketPublicAllocatorConfig(
    vault,
    adapter,
    adapterMarketCapId,
    client,
  );
}
```
