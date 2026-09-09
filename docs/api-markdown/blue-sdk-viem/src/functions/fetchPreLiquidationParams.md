[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / fetchPreLiquidationParams

# Function: fetchPreLiquidationParams()

> **fetchPreLiquidationParams**(`preLiquidation`, `client`, `parameters?`): `Promise`\<[`PreLiquidationParams`](../../../blue-sdk/src/classes/PreLiquidationParams.md)\>

Defined in: [packages/blue-sdk-viem/src/fetch/Position.ts:102](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/fetch/Position.ts#L102)

Fetches pre-liquidation parameters from a pre-liquidation contract.

Reads `preLiquidationParams()` and wraps the result in `PreLiquidationParams`.

## Parameters

### preLiquidation

`` `0x${string}` ``

Address of the pre-liquidation contract.

### client

`Client`

Viem client used for the contract read.

### parameters?

[`DeploylessFetchParameters`](../type-aliases/DeploylessFetchParameters.md) = `{}`

## Returns

`Promise`\<[`PreLiquidationParams`](../../../blue-sdk/src/classes/PreLiquidationParams.md)\>

The hydrated `PreLiquidationParams` entity.

## Example

```ts
import type { PreLiquidationParams } from "@morpho-org/blue-sdk";
import { fetchPreLiquidationParams } from "@morpho-org/blue-sdk-viem";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const client = createPublicClient({ chain: mainnet, transport: http() });
const preLiquidation = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";

const params: PreLiquidationParams = await fetchPreLiquidationParams(
  preLiquidation,
  client,
);
```
