[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / fetchVaultConfig

# Function: fetchVaultConfig()

> **fetchVaultConfig**(`address`, `client`, `parameters?`): `Promise`\<[`VaultConfig`](../../../blue-sdk/src/classes/VaultConfig.md)\>

Defined in: [packages/blue-sdk-viem/src/fetch/VaultConfig.ts:36](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/fetch/VaultConfig.ts#L36)

Fetches immutable and token-derived MetaMorpho vault configuration.

Reads token metadata through `fetchToken`, plus `asset()` and `DECIMALS_OFFSET()` from the vault.

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

`Promise`\<[`VaultConfig`](../../../blue-sdk/src/classes/VaultConfig.md)\>

The hydrated `VaultConfig` entity.

## Example

```ts
import type { VaultConfig } from "@morpho-org/blue-sdk";
import { fetchVaultConfig } from "@morpho-org/blue-sdk-viem";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const client = createPublicClient({ chain: mainnet, transport: http() });
const vault = "0x9a8bC3B04b7f3D87cfC09ba407dCED575f2d61D8";

const config: VaultConfig = await fetchVaultConfig(vault, client);
```
