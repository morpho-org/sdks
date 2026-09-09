[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / fetchHolding

# Function: fetchHolding()

> **fetchHolding**(`user`, `token`, `client`, `__namedParameters?`): `Promise`\<[`Holding`](../../../blue-sdk/src/classes/Holding.md)\>

Defined in: [packages/blue-sdk-viem/src/fetch/Holding.ts:63](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/fetch/Holding.ts#L63)

Fetches a user's token holding, allowances, permit nonce, and transfer permission state.

Reads native balances directly for `NATIVE_ADDRESS`. For ERC20 tokens, uses the deployless
`GetHolding` query by default and falls back to individual ERC20, Permit2, ERC-2612, Backed, and
permissioned-wrapper contract reads when allowed.

## Parameters

### user

`` `0x${string}` ``

Address whose holding is fetched.

### token

`` `0x${string}` ``

Token address, or `NATIVE_ADDRESS` for the native asset.

### client

`Client`

Viem client used for deployless reads or multicalls.

### \_\_namedParameters?

[`DeploylessFetchParameters`](../type-aliases/DeploylessFetchParameters.md) = `{}`

## Returns

`Promise`\<[`Holding`](../../../blue-sdk/src/classes/Holding.md)\>

The hydrated `Holding` entity for `user` and `token`.

## Example

```ts
import { NATIVE_ADDRESS, type Holding } from "@morpho-org/blue-sdk";
import { fetchHolding } from "@morpho-org/blue-sdk-viem";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const client = createPublicClient({ chain: mainnet, transport: http() });
const user = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";

const holding: Holding = await fetchHolding(user, NATIVE_ADDRESS, client);
```
