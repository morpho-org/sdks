[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / fetchVault

# Function: fetchVault()

> **fetchVault**(`address`, `client`, `__namedParameters?`): `Promise`\<[`Vault`](../../../blue-sdk/src/classes/Vault.md)\>

Defined in: [packages/blue-sdk-viem/src/fetch/Vault.ts:56](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/fetch/Vault.ts#L56)

Fetches MetaMorpho vault state, accounting, queues, and public allocator config.

Uses the deployless `GetVault` query by default and falls back to MetaMorpho, factory, and
PublicAllocator contract reads when allowed.

## Parameters

### address

`` `0x${string}` ``

MetaMorpho vault address.

### client

`Client`

Viem client used for deployless reads or multicalls.

### \_\_namedParameters?

[`DeploylessFetchParameters`](../type-aliases/DeploylessFetchParameters.md) = `{}`

## Returns

`Promise`\<[`Vault`](../../../blue-sdk/src/classes/Vault.md)\>

The hydrated `Vault` entity.

## Throws

when the configured chain has no MetaMorpho factory.

## Throws

when `address` is not a MetaMorpho vault from the configured factory.

## Example

```ts
import type { Vault } from "@morpho-org/blue-sdk";
import { fetchVault } from "@morpho-org/blue-sdk-viem";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const client = createPublicClient({ chain: mainnet, transport: http() });
const vaultAddress = "0x9a8bC3B04b7f3D87cfC09ba407dCED575f2d61D8";

const vault: Vault = await fetchVault(vaultAddress, client);
```
