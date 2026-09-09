[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / fetchMarket

# Function: fetchMarket()

> **fetchMarket**(`id`, `client`, `__namedParameters?`): `Promise`\<[`Market`](../../../blue-sdk/src/classes/Market.md)\>

Defined in: [packages/blue-sdk-viem/src/fetch/Market.ts:46](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/fetch/Market.ts#L46)

Fetches Morpho Blue market state, params, oracle price, and adaptive IRM rate.

Reads `Morpho.idToMarketParams(id)`, `Morpho.market(id)`, the market oracle price when configured,
and `AdaptiveCurveIRM.rateAtTarget(id)` when the market uses the adaptive curve IRM. Uses the
deployless `GetMarket` query by default and falls back to individual reads when allowed.

## Parameters

### id

[`MarketId`](../../../blue-sdk/src/type-aliases/MarketId.md)

Market id to fetch.

### client

`Client`

Viem client used for deployless reads or multicalls.

### \_\_namedParameters?

[`DeploylessFetchParameters`](../type-aliases/DeploylessFetchParameters.md) = `{}`

## Returns

`Promise`\<[`Market`](../../../blue-sdk/src/classes/Market.md)\>

The hydrated `Market` entity.

## Example

```ts
import type { Market, MarketId } from "@morpho-org/blue-sdk";
import { fetchMarket } from "@morpho-org/blue-sdk-viem";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const client = createPublicClient({ chain: mainnet, transport: http() });
const marketId =
  "0xdba352c33d64fc9bff091d505dbfcbc6c41b89986c2193b22a90031e9dac7f76" as MarketId;

const market: Market = await fetchMarket(marketId, client);
```
