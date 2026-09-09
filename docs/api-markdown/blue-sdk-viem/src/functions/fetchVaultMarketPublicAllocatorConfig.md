[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / fetchVaultMarketPublicAllocatorConfig

# Function: fetchVaultMarketPublicAllocatorConfig()

> **fetchVaultMarketPublicAllocatorConfig**(`vault`, `marketId`, `client`, `parameters?`): `Promise`\<[`VaultMarketPublicAllocatorConfig`](../../../blue-sdk/src/classes/VaultMarketPublicAllocatorConfig.md) \| `undefined`\>

Defined in: [packages/blue-sdk-viem/src/fetch/VaultMarketPublicAllocatorConfig.ts:44](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/fetch/VaultMarketPublicAllocatorConfig.ts#L44)

Fetches PublicAllocator flow caps for a vault market.

Reads `PublicAllocator.flowCaps(vault, marketId)` when the configured chain has a
PublicAllocator deployment.

## Parameters

### vault

`` `0x${string}` ``

MetaMorpho vault address.

### marketId

[`MarketId`](../../../blue-sdk/src/type-aliases/MarketId.md)

Market id whose flow caps are fetched.

### client

`Client`

Viem client used for the contract read.

### parameters?

[`FetchParameters`](../type-aliases/FetchParameters.md) = `{}`

## Returns

`Promise`\<[`VaultMarketPublicAllocatorConfig`](../../../blue-sdk/src/classes/VaultMarketPublicAllocatorConfig.md) \| `undefined`\>

The hydrated `VaultMarketPublicAllocatorConfig`, or `undefined` when the chain has no
  PublicAllocator deployment.

## Example

```ts
import type { MarketId, VaultMarketPublicAllocatorConfig } from "@morpho-org/blue-sdk";
import { fetchVaultMarketPublicAllocatorConfig } from "@morpho-org/blue-sdk-viem";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const client = createPublicClient({ chain: mainnet, transport: http() });
const vault = "0x9a8bC3B04b7f3D87cfC09ba407dCED575f2d61D8";
const marketId =
  "0xdba352c33d64fc9bff091d505dbfcbc6c41b89986c2193b22a90031e9dac7f76" as MarketId;

const config: VaultMarketPublicAllocatorConfig | undefined =
  await fetchVaultMarketPublicAllocatorConfig(vault, marketId, client);
```
