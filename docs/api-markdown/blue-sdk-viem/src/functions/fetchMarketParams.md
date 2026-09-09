[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / fetchMarketParams

# Function: fetchMarketParams()

> **fetchMarketParams**(`id`, `client`, `__namedParameters?`): `Promise`\<[`MarketParams`](../../../blue-sdk/src/classes/MarketParams.md)\>

Defined in: [packages/blue-sdk-viem/src/fetch/MarketParams.ts:39](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/fetch/MarketParams.ts#L39)

Fetches immutable Morpho Blue market params by market id.

Reads the local `MarketParams` registry first, then falls back to
`Morpho.idToMarketParams(id)` at the latest block when the id is not registered locally.

## Parameters

### id

[`MarketId`](../../../blue-sdk/src/type-aliases/MarketId.md)

Market id whose params should be resolved.

### client

`Client`

Viem client used for the fallback on-chain read.

### \_\_namedParameters?

`Pick`\<[`FetchParameters`](../type-aliases/FetchParameters.md), `"chainId"`\> = `{}`

## Returns

`Promise`\<[`MarketParams`](../../../blue-sdk/src/classes/MarketParams.md)\>

The resolved `MarketParams` entity.

## Example

```ts
import type { MarketId, MarketParams } from "@morpho-org/blue-sdk";
import { fetchMarketParams } from "@morpho-org/blue-sdk-viem";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const client = createPublicClient({ chain: mainnet, transport: http() });
const marketId =
  "0xdba352c33d64fc9bff091d505dbfcbc6c41b89986c2193b22a90031e9dac7f76" as MarketId;

const params: MarketParams = await fetchMarketParams(marketId, client);
```
