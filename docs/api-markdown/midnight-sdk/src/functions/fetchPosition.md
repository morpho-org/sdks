[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / fetchPosition

# Function: fetchPosition()

> **fetchPosition**(`client`, `params`): `Promise`\<[`Position`](../classes/Position.md)\>

Defined in: [packages/midnight-sdk/src/fetch/Position.ts:59](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/fetch/Position.ts#L59)

Fetches a Midnight position by id and user.

The Solidity storage getter does not return the fixed collateral array, so
this helper reads each collateral slot before returning the position.
The deployless path is used by default. If deployless is disabled or
unavailable, the direct fallback can fan out to 130 RPC calls unless the viem
client has `batch.multicall` enabled.

Reads `eth_chainId` only when the viem client has no configured chain id. In
deployless mode, reads the deployless `GetPosition.query(midnight, marketId,
user)` helper. If deployless is disabled or falls back, reads
`Midnight.position(marketId, user)` and each
`Midnight.collateral(marketId, user, index)` slot for `index` 0 through 127.

## Parameters

### client

`Client`

Viem client used for the reads.

### params

[`DeploylessFetchParameters`](../interfaces/DeploylessFetchParameters.md) & `object`

## Returns

`Promise`\<[`Position`](../classes/Position.md)\>

Normalized position object.

## Throws

when no address registry exists for the client chain id.

## Throws

when the registry has no Midnight address for the client chain id.

## Example

```ts
import { fetchPosition } from "@morpho-org/midnight-sdk";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

const client = createPublicClient({ chain: base, transport: http() });
const position = await fetchPosition(client, {
  marketId: "0x12590ae1aee324a005be565f3bcdd16dbf8daf7969b26c181c8b8f467dad9f67",
  user: "0x0000000000000000000000000000000000009000",
});
console.log(position.debt);
```
