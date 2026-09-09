[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / fetchVaultUser

# Function: fetchVaultUser()

> **fetchVaultUser**(`vault`, `user`, `client`, `__namedParameters?`): `Promise`\<[`VaultUser`](../../../blue-sdk/src/classes/VaultUser.md)\>

Defined in: [packages/blue-sdk-viem/src/fetch/VaultUser.ts:41](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/fetch/VaultUser.ts#L41)

Fetches a user's MetaMorpho vault allowance and allocator status.

Uses the deployless `GetVaultUser` query by default and falls back to the vault asset allowance
and `isAllocator(user)` reads when allowed.

## Parameters

### vault

`` `0x${string}` ``

MetaMorpho vault address.

### user

`` `0x${string}` ``

User address whose vault state is fetched.

### client

`Client`

Viem client used for deployless reads or multicalls.

### \_\_namedParameters?

[`DeploylessFetchParameters`](../type-aliases/DeploylessFetchParameters.md) = `{}`

## Returns

`Promise`\<[`VaultUser`](../../../blue-sdk/src/classes/VaultUser.md)\>

The hydrated `VaultUser` entity.

## Example

```ts
import type { VaultUser } from "@morpho-org/blue-sdk";
import { fetchVaultUser } from "@morpho-org/blue-sdk-viem";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const client = createPublicClient({ chain: mainnet, transport: http() });
const vault = "0x9a8bC3B04b7f3D87cfC09ba407dCED575f2d61D8";
const user = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";

const vaultUser: VaultUser = await fetchVaultUser(vault, user, client);
```
