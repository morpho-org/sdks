[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / fetchAccrualVault

# Function: fetchAccrualVault()

> **fetchAccrualVault**(`address`, `client`, `parameters?`): `Promise`\<[`AccrualVault`](../../../blue-sdk/src/classes/AccrualVault.md)\>

Defined in: [packages/blue-sdk-viem/src/fetch/Vault.ts:403](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/fetch/Vault.ts#L403)

Fetches MetaMorpho vault state with accrued market allocations.

Reads the vault state with `fetchVault`, then fetches an accrued `VaultMarketAllocation` for every
market in the withdraw queue.

## Parameters

### address

`` `0x${string}` ``

MetaMorpho vault address.

### client

`Client`

Viem client used for deployless reads or multicalls.

### parameters?

[`DeploylessFetchParameters`](../type-aliases/DeploylessFetchParameters.md) = `{}`

## Returns

`Promise`\<[`AccrualVault`](../../../blue-sdk/src/classes/AccrualVault.md)\>

The hydrated `AccrualVault` entity with accrued market allocations.

## Throws

when the configured chain has no MetaMorpho factory.

## Throws

when `address` is not a MetaMorpho vault from the configured factory.

## Example

```ts
import type { AccrualVault } from "@morpho-org/blue-sdk";
import { fetchAccrualVault } from "@morpho-org/blue-sdk-viem";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const client = createPublicClient({ chain: mainnet, transport: http() });
const vaultAddress = "0x9a8bC3B04b7f3D87cfC09ba407dCED575f2d61D8";

const vault: AccrualVault = await fetchAccrualVault(vaultAddress, client);
```
