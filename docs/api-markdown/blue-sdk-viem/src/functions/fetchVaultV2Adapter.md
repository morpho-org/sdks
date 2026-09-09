[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / fetchVaultV2Adapter

# Function: fetchVaultV2Adapter()

> **fetchVaultV2Adapter**(`address`, `client`, `parameters?`): `Promise`\<[`VaultV2MorphoMarketV1Adapter`](../../../blue-sdk/src/classes/VaultV2MorphoMarketV1Adapter.md) \| [`VaultV2MorphoMarketV1AdapterV2`](../../../blue-sdk/src/classes/VaultV2MorphoMarketV1AdapterV2.md) \| [`VaultV2MorphoVaultV1Adapter`](../../../blue-sdk/src/classes/VaultV2MorphoVaultV1Adapter.md)\>

Defined in: [packages/blue-sdk-viem/src/fetch/vault-v2/VaultV2Adapter.ts:56](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/fetch/vault-v2/VaultV2Adapter.ts#L56)

Fetches a VaultV2 adapter by detecting its adapter factory type.

Reads the configured MorphoVaultV1Adapter, MorphoMarketV1Adapter, and
MorphoMarketV1AdapterV2 factories, then delegates to the matching adapter fetcher.

## Parameters

### address

`` `0x${string}` ``

Adapter address to fetch.

### client

`Client`

Viem client used for deployless reads or multicalls.

### parameters?

[`DeploylessFetchParameters`](../type-aliases/DeploylessFetchParameters.md) = `{}`

## Returns

`Promise`\<[`VaultV2MorphoMarketV1Adapter`](../../../blue-sdk/src/classes/VaultV2MorphoMarketV1Adapter.md) \| [`VaultV2MorphoMarketV1AdapterV2`](../../../blue-sdk/src/classes/VaultV2MorphoMarketV1AdapterV2.md) \| [`VaultV2MorphoVaultV1Adapter`](../../../blue-sdk/src/classes/VaultV2MorphoVaultV1Adapter.md)\>

The hydrated supported VaultV2 adapter entity.

## Throws

when `address` is not a supported adapter type.

## Example

```ts
import type { IVaultV2Adapter } from "@morpho-org/blue-sdk";
import { fetchVaultV2Adapter } from "@morpho-org/blue-sdk-viem";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

const client = createPublicClient({ chain: base, transport: http() });
const adapterAddress = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";

const adapter: IVaultV2Adapter = await fetchVaultV2Adapter(adapterAddress, client);
```
