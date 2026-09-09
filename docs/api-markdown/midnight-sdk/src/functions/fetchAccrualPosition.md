[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / fetchAccrualPosition

# Function: fetchAccrualPosition()

> **fetchAccrualPosition**(`client`, `params`): `Promise`\<[`AccrualPosition`](../classes/AccrualPosition.md)\>

Defined in: [packages/midnight-sdk/src/fetch/Position.ts:163](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/fetch/Position.ts#L163)

Fetches a Midnight position paired with its hydrated market.

Reads the full inventory of `fetchPosition` and `fetchMarket` at the same
call parameters: `eth_chainId` only when needed,
`Midnight.toMarket(marketId)`, `Midnight.marketState(marketId)`, and either
deployless `GetPosition.query(midnight, marketId, user)` or direct
`Midnight.position(marketId, user)` plus all collateral slots.

## Parameters

### client

`Client`

Viem client used for the reads.

### params

[`DeploylessFetchParameters`](../interfaces/DeploylessFetchParameters.md) & `object`

## Returns

`Promise`\<[`AccrualPosition`](../classes/AccrualPosition.md)\>

Accrual position instance.

## Throws

when no address registry exists for the client chain id.

## Throws

when the registry has no Midnight address for the client chain id.

## Example

```ts
import { fetchAccrualPosition } from "@morpho-org/midnight-sdk";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

const client = createPublicClient({ chain: base, transport: http() });
const position = await fetchAccrualPosition(client, {
  marketId: "0x12590ae1aee324a005be565f3bcdd16dbf8daf7969b26c181c8b8f467dad9f67",
  user: "0x0000000000000000000000000000000000009000",
});
console.log(position.market.id);
```
