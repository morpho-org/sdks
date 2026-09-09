[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [midnight-sdk/src](../README.md) / fetchMarket

# Function: fetchMarket()

> **fetchMarket**(`client`, `params`): `Promise`\<[`Market`](../classes/Market.md)\>

Defined in: [packages/midnight-sdk/src/fetch/Market.ts:89](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/midnight-sdk/src/fetch/Market.ts#L89)

Fetches a hydrated market by id.

Reads `eth_chainId` only when the viem client has no configured chain id,
then reads `Midnight.toMarket(marketId)` and `Midnight.marketState(marketId)`.

## Parameters

### client

`Client`

Viem client used for the reads.

### params

[`DeploylessFetchParameters`](../interfaces/DeploylessFetchParameters.md) & `object`

## Returns

`Promise`\<[`Market`](../classes/Market.md)\>

Market instance.

## Throws

when no address registry exists for the client chain id.

## Throws

when the registry has no Midnight address for the client chain id.

## Example

```ts
import { fetchMarket } from "@morpho-org/midnight-sdk";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

const client = createPublicClient({ chain: base, transport: http() });
const market = await fetchMarket(client, {
  marketId: "0x12590ae1aee324a005be565f3bcdd16dbf8daf7969b26c181c8b8f467dad9f67",
});
console.log(market.params.loanToken);
```
