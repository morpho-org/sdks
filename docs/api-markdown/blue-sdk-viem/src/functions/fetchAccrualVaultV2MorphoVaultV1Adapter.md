[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / fetchAccrualVaultV2MorphoVaultV1Adapter

# Function: fetchAccrualVaultV2MorphoVaultV1Adapter()

> **fetchAccrualVaultV2MorphoVaultV1Adapter**(`address`, `client`, `parameters?`): `Promise`\<[`AccrualVaultV2MorphoVaultV1Adapter`](../../../blue-sdk/src/classes/AccrualVaultV2MorphoVaultV1Adapter.md)\>

Defined in: [packages/blue-sdk-viem/src/fetch/vault-v2/VaultV2MorphoVaultV1Adapter.ts:160](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/fetch/vault-v2/VaultV2MorphoVaultV1Adapter.ts#L160)

Fetches a MorphoVaultV1Adapter with accrued parent vault state and adapter shares.

Reads the adapter state, the accrued MetaMorpho vault it wraps, and the adapter's vault share
balance.

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

`Promise`\<[`AccrualVaultV2MorphoVaultV1Adapter`](../../../blue-sdk/src/classes/AccrualVaultV2MorphoVaultV1Adapter.md)\>

The hydrated `AccrualVaultV2MorphoVaultV1Adapter` entity.

## Throws

when the configured chain has no MorphoVaultV1Adapter factory.

## Throws

when `address` is not an adapter from the configured factory.

## Example

```ts
import type { AccrualVaultV2MorphoVaultV1Adapter } from "@morpho-org/blue-sdk";
import { fetchAccrualVaultV2MorphoVaultV1Adapter } from "@morpho-org/blue-sdk-viem";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

const client = createPublicClient({ chain: base, transport: http() });
const adapterAddress = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";

const adapter: AccrualVaultV2MorphoVaultV1Adapter =
  await fetchAccrualVaultV2MorphoVaultV1Adapter(adapterAddress, client);
```
