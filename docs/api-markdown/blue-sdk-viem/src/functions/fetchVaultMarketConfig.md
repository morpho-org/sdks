[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / fetchVaultMarketConfig

# Function: fetchVaultMarketConfig()

> **fetchVaultMarketConfig**(`vault`, `marketId`, `client`, `parameters?`): `Promise`\<[`VaultMarketConfig`](../../../blue-sdk/src/classes/VaultMarketConfig.md)\>

Defined in: [packages/blue-sdk-viem/src/fetch/VaultMarketConfig.ts:44](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/fetch/VaultMarketConfig.ts#L44)

Fetches a MetaMorpho vault market configuration.

Reads `config(marketId)`, `pendingCap(marketId)`, and public allocator flow caps when the chain
has a PublicAllocator deployment.

## Parameters

### vault

`` `0x${string}` ``

MetaMorpho vault address.

### marketId

[`MarketId`](../../../blue-sdk/src/type-aliases/MarketId.md)

Market id whose vault config is fetched.

### client

`Client`

Viem client used for the contract reads.

### parameters?

[`FetchParameters`](../type-aliases/FetchParameters.md) = `{}`

## Returns

`Promise`\<[`VaultMarketConfig`](../../../blue-sdk/src/classes/VaultMarketConfig.md)\>

The hydrated `VaultMarketConfig` entity.

## Example

```ts
import type { MarketId, VaultMarketConfig } from "@morpho-org/blue-sdk";
import { fetchVaultMarketConfig } from "@morpho-org/blue-sdk-viem";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const client = createPublicClient({ chain: mainnet, transport: http() });
const vault = "0x9a8bC3B04b7f3D87cfC09ba407dCED575f2d61D8";
const marketId =
  "0xdba352c33d64fc9bff091d505dbfcbc6c41b89986c2193b22a90031e9dac7f76" as MarketId;

const config: VaultMarketConfig = await fetchVaultMarketConfig(
  vault,
  marketId,
  client,
);
```
