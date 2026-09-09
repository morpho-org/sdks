[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / fetchVaultV2BluePublicAllocatorData

# Function: fetchVaultV2BluePublicAllocatorData()

> **fetchVaultV2BluePublicAllocatorData**(`vault`, `client`, `__namedParameters?`): `Promise`\<\{ `activeAdapters`: `Set`\<`` `0x${string}` ``\>; `allocations`: `Record`\<`` `0x${string}` ``, [`IVaultV2Allocation`](../../../blue-sdk/src/interfaces/IVaultV2Allocation.md) \| `undefined`\>; `marketPublicAllocatorConfigs`: `Record`\<`` `0x${string}` ``, [`VaultV2BlueMarketPublicAllocatorConfig`](../../../blue-sdk/src/classes/VaultV2BlueMarketPublicAllocatorConfig.md) \| `undefined`\>; `publicAllocatorConfig`: [`VaultV2BluePublicAllocatorConfig`](../../../blue-sdk/src/classes/VaultV2BluePublicAllocatorConfig.md) \| `undefined`; \}\>

Defined in: [packages/blue-sdk-viem/src/fetch/vault-v2/VaultV2BluePublicAllocatorConfig.ts:115](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/fetch/vault-v2/VaultV2BluePublicAllocatorConfig.ts#L115)

Fetches all BluePublicAllocator and Vault V2 cap data needed to simulate
reallocations for one hydrated Vault V2.

Only `VaultV2MorphoMarketV1AdapterV2` adapters participate. The function
derives every adapter-market id and shared vault allocation id from the
hydrated vault, uses one deployless `eth_call` by default, and falls back to
direct reads unless deployless mode is forced.

## Parameters

### vault

[`AccrualVaultV2`](../../../blue-sdk/src/classes/AccrualVaultV2.md)

Hydrated Vault V2 whose accrued adapters provide the candidate markets.

### client

`Client`

Viem client used for deployless or direct reads.

### \_\_namedParameters?

[`DeploylessFetchParameters`](../type-aliases/DeploylessFetchParameters.md) & `object` = `{}`

## Returns

`Promise`\<\{ `activeAdapters`: `Set`\<`` `0x${string}` ``\>; `allocations`: `Record`\<`` `0x${string}` ``, [`IVaultV2Allocation`](../../../blue-sdk/src/interfaces/IVaultV2Allocation.md) \| `undefined`\>; `marketPublicAllocatorConfigs`: `Record`\<`` `0x${string}` ``, [`VaultV2BlueMarketPublicAllocatorConfig`](../../../blue-sdk/src/classes/VaultV2BlueMarketPublicAllocatorConfig.md) \| `undefined`\>; `publicAllocatorConfig`: [`VaultV2BluePublicAllocatorConfig`](../../../blue-sdk/src/classes/VaultV2BluePublicAllocatorConfig.md) \| `undefined`; \}\>

Vault-wide config when the BluePublicAllocator is authorized, active-adapter set, adapter-market configs keyed by `adapterMarketCapId`, and allocations keyed by derived id.

## Throws

when the chain has no BluePublicAllocator deployment.

## Throws

when the chain is absent from the address registry.

## Throws

when deployless mode is forced and fails, or when a direct contract read fails.

## Example

```ts
import type { AccrualVaultV2 } from "@morpho-org/blue-sdk";
import { fetchVaultV2BluePublicAllocatorData } from "@morpho-org/blue-sdk-viem";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const client = createPublicClient({ chain: mainnet, transport: http() });
export async function fetchAllocatorData(
  vault: AccrualVaultV2,
) {
  const data = await fetchVaultV2BluePublicAllocatorData(vault, client);
  // data contains publicAllocatorConfig, activeAdapters, marketPublicAllocatorConfigs, and allocations.
  return data;
}
```
