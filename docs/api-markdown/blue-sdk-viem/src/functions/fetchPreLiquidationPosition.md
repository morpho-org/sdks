[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / fetchPreLiquidationPosition

# Function: fetchPreLiquidationPosition()

> **fetchPreLiquidationPosition**(`user`, `marketId`, `preLiquidation`, `client`, `parameters?`): `Promise`\<[`PreLiquidationPosition`](../../../blue-sdk/src/classes/PreLiquidationPosition.md)\>

Defined in: [packages/blue-sdk-viem/src/fetch/Position.ts:213](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/fetch/Position.ts#L213)

Fetches a user's position with pre-liquidation state and oracle pricing.

Reads the raw user position, market state, pre-liquidation params, and pre-liquidation oracle price
when available.

## Parameters

### user

`` `0x${string}` ``

Address whose position is fetched.

### marketId

[`MarketId`](../../../blue-sdk/src/type-aliases/MarketId.md)

Market id of the position.

### preLiquidation

`` `0x${string}` ``

Address of the pre-liquidation contract.

### client

`Client`

Viem client used for deployless reads or multicalls.

### parameters?

[`DeploylessFetchParameters`](../type-aliases/DeploylessFetchParameters.md) = `{}`

## Returns

`Promise`\<[`PreLiquidationPosition`](../../../blue-sdk/src/classes/PreLiquidationPosition.md)\>

The hydrated `PreLiquidationPosition` entity.

## Example

```ts
import type { MarketId, PreLiquidationPosition } from "@morpho-org/blue-sdk";
import { fetchPreLiquidationPosition } from "@morpho-org/blue-sdk-viem";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const client = createPublicClient({ chain: mainnet, transport: http() });
const user = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
const preLiquidation = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
const marketId =
  "0xdba352c33d64fc9bff091d505dbfcbc6c41b89986c2193b22a90031e9dac7f76" as MarketId;

const position: PreLiquidationPosition = await fetchPreLiquidationPosition(
  user,
  marketId,
  preLiquidation,
  client,
);
```
