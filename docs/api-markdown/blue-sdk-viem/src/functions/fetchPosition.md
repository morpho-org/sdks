[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / fetchPosition

# Function: fetchPosition()

> **fetchPosition**(`user`, `marketId`, `client`, `parameters?`): `Promise`\<[`Position`](../../../blue-sdk/src/classes/Position.md)\>

Defined in: [packages/blue-sdk-viem/src/fetch/Position.ts:47](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/fetch/Position.ts#L47)

Fetches a user's raw Morpho Blue position for a market.

Reads `Morpho.position(marketId, user)` from the configured chain.

## Parameters

### user

`` `0x${string}` ``

Address whose position is fetched.

### marketId

[`MarketId`](../../../blue-sdk/src/type-aliases/MarketId.md)

Market id of the position.

### client

`Client`

Viem client used for the contract read.

### parameters?

[`FetchParameters`](../type-aliases/FetchParameters.md) = `{}`

## Returns

`Promise`\<[`Position`](../../../blue-sdk/src/classes/Position.md)\>

The hydrated `Position` entity.

## Example

```ts
import type { MarketId, Position } from "@morpho-org/blue-sdk";
import { fetchPosition } from "@morpho-org/blue-sdk-viem";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const client = createPublicClient({ chain: mainnet, transport: http() });
const user = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
const marketId =
  "0xdba352c33d64fc9bff091d505dbfcbc6c41b89986c2193b22a90031e9dac7f76" as MarketId;

const position: Position = await fetchPosition(user, marketId, client);
```
