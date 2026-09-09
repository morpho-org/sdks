[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / fetchVaultV2MorphoMarketV1Adapter

# Function: fetchVaultV2MorphoMarketV1Adapter()

> **fetchVaultV2MorphoMarketV1Adapter**(`address`, `client`, `__namedParameters?`): `Promise`\<[`VaultV2MorphoMarketV1Adapter`](../../../blue-sdk/src/classes/VaultV2MorphoMarketV1Adapter.md)\>

Defined in: [packages/blue-sdk-viem/src/fetch/vault-v2/VaultV2MorphoMarketV1Adapter.ts:55](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/fetch/vault-v2/VaultV2MorphoMarketV1Adapter.ts#L55)

Fetches a MorphoMarketV1Adapter used by VaultV2.

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

`Promise`\<[`VaultV2MorphoMarketV1Adapter`](../../../blue-sdk/src/classes/VaultV2MorphoMarketV1Adapter.md)\>

The hydrated `VaultV2MorphoMarketV1Adapter` entity.

## Throws

when the configured chain has no MorphoMarketV1Adapter factory.

## Throws

when `address` is not an adapter from the configured factory.

## Example

```ts
import type { VaultV2MorphoMarketV1Adapter } from "@morpho-org/blue-sdk";
import { fetchVaultV2MorphoMarketV1Adapter } from "@morpho-org/blue-sdk-viem";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

const client = createPublicClient({ chain: base, transport: http() });
const adapterAddress = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";

const adapter: VaultV2MorphoMarketV1Adapter =
  await fetchVaultV2MorphoMarketV1Adapter(adapterAddress, client);
```
