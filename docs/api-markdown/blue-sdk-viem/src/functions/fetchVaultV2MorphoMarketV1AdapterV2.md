[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / fetchVaultV2MorphoMarketV1AdapterV2

# Function: fetchVaultV2MorphoMarketV1AdapterV2()

> **fetchVaultV2MorphoMarketV1AdapterV2**(`address`, `client`, `__namedParameters?`): `Promise`\<[`VaultV2MorphoMarketV1AdapterV2`](../../../blue-sdk/src/classes/VaultV2MorphoMarketV1AdapterV2.md)\>

Defined in: [packages/blue-sdk-viem/src/fetch/vault-v2/VaultV2MorphoMarketV1AdapterV2.ts:56](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/fetch/vault-v2/VaultV2MorphoMarketV1AdapterV2.ts#L56)

Fetches a MorphoMarketV1AdapterV2 used by VaultV2.

Uses the deployless adapter query by default and falls back to factory validation plus adapter
state reads when allowed.

## Parameters

### address

`` `0x${string}` ``

Adapter address to fetch.

### client

`Client`

Viem client used for deployless reads or multicalls.

### \_\_namedParameters?

[`DeploylessFetchParameters`](../type-aliases/DeploylessFetchParameters.md) = `{}`

## Returns

`Promise`\<[`VaultV2MorphoMarketV1AdapterV2`](../../../blue-sdk/src/classes/VaultV2MorphoMarketV1AdapterV2.md)\>

The hydrated `VaultV2MorphoMarketV1AdapterV2` entity.

## Throws

when the configured chain has no MorphoMarketV1AdapterV2 factory.

## Throws

when `address` is not an adapter from the configured factory.

## Example

```ts
import type { VaultV2MorphoMarketV1AdapterV2 } from "@morpho-org/blue-sdk";
import { fetchVaultV2MorphoMarketV1AdapterV2 } from "@morpho-org/blue-sdk-viem";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

const client = createPublicClient({ chain: base, transport: http() });
const adapterAddress = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";

const adapter: VaultV2MorphoMarketV1AdapterV2 =
  await fetchVaultV2MorphoMarketV1AdapterV2(adapterAddress, client);
```
