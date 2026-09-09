[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / fetchAccrualVaultV2Adapter

# Function: fetchAccrualVaultV2Adapter()

> **fetchAccrualVaultV2Adapter**(`address`, `client`, `parameters?`): `Promise`\<[`AccrualVaultV2MorphoMarketV1Adapter`](../../../blue-sdk/src/classes/AccrualVaultV2MorphoMarketV1Adapter.md) \| [`AccrualVaultV2MorphoMarketV1AdapterV2`](../../../blue-sdk/src/classes/AccrualVaultV2MorphoMarketV1AdapterV2.md) \| [`AccrualVaultV2MorphoVaultV1Adapter`](../../../blue-sdk/src/classes/AccrualVaultV2MorphoVaultV1Adapter.md)\>

Defined in: [packages/blue-sdk-viem/src/fetch/vault-v2/VaultV2Adapter.ts:154](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/fetch/vault-v2/VaultV2Adapter.ts#L154)

Fetches a VaultV2 adapter with the accrued state required for allocation calculations.

Reads the configured adapter factories, then delegates to the matching accrual adapter fetcher.

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

`Promise`\<[`AccrualVaultV2MorphoMarketV1Adapter`](../../../blue-sdk/src/classes/AccrualVaultV2MorphoMarketV1Adapter.md) \| [`AccrualVaultV2MorphoMarketV1AdapterV2`](../../../blue-sdk/src/classes/AccrualVaultV2MorphoMarketV1AdapterV2.md) \| [`AccrualVaultV2MorphoVaultV1Adapter`](../../../blue-sdk/src/classes/AccrualVaultV2MorphoVaultV1Adapter.md)\>

The hydrated supported VaultV2 accrual adapter entity.

## Throws

when `address` is not a supported adapter type.

## Example

```ts
import type { IAccrualVaultV2Adapter } from "@morpho-org/blue-sdk";
import { fetchAccrualVaultV2Adapter } from "@morpho-org/blue-sdk-viem";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

const client = createPublicClient({ chain: base, transport: http() });
const adapterAddress = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";

const adapter: IAccrualVaultV2Adapter = await fetchAccrualVaultV2Adapter(
  adapterAddress,
  client,
);
```
