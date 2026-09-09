[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / fetchAccrualVaultV2MorphoMarketV1Adapter

# Function: fetchAccrualVaultV2MorphoMarketV1Adapter()

> **fetchAccrualVaultV2MorphoMarketV1Adapter**(`address`, `client`, `parameters?`): `Promise`\<[`AccrualVaultV2MorphoMarketV1Adapter`](../../../blue-sdk/src/classes/AccrualVaultV2MorphoMarketV1Adapter.md)\>

Defined in: [packages/blue-sdk-viem/src/fetch/vault-v2/VaultV2MorphoMarketV1Adapter.ts:182](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/fetch/vault-v2/VaultV2MorphoMarketV1Adapter.ts#L182)

Fetches a MorphoMarketV1Adapter with accrued market positions.

Reads the adapter state, then fetches an accrued position for each market params entry.

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

`Promise`\<[`AccrualVaultV2MorphoMarketV1Adapter`](../../../blue-sdk/src/classes/AccrualVaultV2MorphoMarketV1Adapter.md)\>

The hydrated `AccrualVaultV2MorphoMarketV1Adapter` entity.

## Throws

when the configured chain has no MorphoMarketV1Adapter factory.

## Throws

when `address` is not an adapter from the configured factory.

## Example

```ts
import type { AccrualVaultV2MorphoMarketV1Adapter } from "@morpho-org/blue-sdk";
import { fetchAccrualVaultV2MorphoMarketV1Adapter } from "@morpho-org/blue-sdk-viem";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

const client = createPublicClient({ chain: base, transport: http() });
const adapterAddress = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";

const adapter: AccrualVaultV2MorphoMarketV1Adapter =
  await fetchAccrualVaultV2MorphoMarketV1Adapter(adapterAddress, client);
```
