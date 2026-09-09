[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / fetchAccrualPosition

# Function: fetchAccrualPosition()

> **fetchAccrualPosition**(`user`, `marketId`, `client`, `parameters?`): `Promise`\<[`AccrualPosition`](../../../blue-sdk/src/classes/AccrualPosition.md)\>

Defined in: [packages/blue-sdk-viem/src/fetch/Position.ts:158](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/fetch/Position.ts#L158)

Fetches a user's Morpho Blue position with accrued market state.

Reads the raw user position and the current market state, then combines them into an
`AccrualPosition`.

## Parameters

### user

`` `0x${string}` ``

Address whose position is fetched.

### marketId

[`MarketId`](../../../blue-sdk/src/type-aliases/MarketId.md)

Market id of the position.

### client

`Client`

Viem client used for deployless reads or multicalls.

### parameters?

[`DeploylessFetchParameters`](../type-aliases/DeploylessFetchParameters.md) = `{}`

## Returns

`Promise`\<[`AccrualPosition`](../../../blue-sdk/src/classes/AccrualPosition.md)\>

The hydrated `AccrualPosition` entity.

## Example

```ts
import type { AccrualPosition, MarketId } from "@morpho-org/blue-sdk";
import { fetchAccrualPosition } from "@morpho-org/blue-sdk-viem";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const client = createPublicClient({ chain: mainnet, transport: http() });
const user = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
const marketId =
  "0xdba352c33d64fc9bff091d505dbfcbc6c41b89986c2193b22a90031e9dac7f76" as MarketId;

const position: AccrualPosition = await fetchAccrualPosition(user, marketId, client);
```
