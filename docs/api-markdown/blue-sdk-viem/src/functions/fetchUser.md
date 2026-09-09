[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / fetchUser

# Function: fetchUser()

> **fetchUser**(`address`, `client`, `parameters?`): `Promise`\<[`User`](../../../blue-sdk/src/classes/User.md)\>

Defined in: [packages/blue-sdk-viem/src/fetch/User.ts:34](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/fetch/User.ts#L34)

Fetches Morpho Blue user authorization and nonce state.

Reads `Morpho.isAuthorized(address, bundler3.generalAdapter1)` and `Morpho.nonce(address)`.

## Parameters

### address

`` `0x${string}` ``

User address to fetch.

### client

`Client`

Viem client used for the contract reads.

### parameters?

[`FetchParameters`](../type-aliases/FetchParameters.md) = `{}`

## Returns

`Promise`\<[`User`](../../../blue-sdk/src/classes/User.md)\>

The hydrated `User` entity.

## Example

```ts
import type { User } from "@morpho-org/blue-sdk";
import { fetchUser } from "@morpho-org/blue-sdk-viem";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const client = createPublicClient({ chain: mainnet, transport: http() });
const address = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";

const user: User = await fetchUser(address, client);
```
