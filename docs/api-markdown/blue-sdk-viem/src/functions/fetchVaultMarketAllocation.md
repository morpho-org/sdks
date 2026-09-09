[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / fetchVaultMarketAllocation

# Function: fetchVaultMarketAllocation()

> **fetchVaultMarketAllocation**(`vault`, `marketId`, `client`, `parameters?`): `Promise`\<[`VaultMarketAllocation`](../../../blue-sdk/src/classes/VaultMarketAllocation.md)\>

Defined in: [packages/blue-sdk-viem/src/fetch/VaultMarketAllocation.ts:44](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/fetch/VaultMarketAllocation.ts#L44)

Fetches a MetaMorpho vault market allocation with accrued market position state.

Reads the market config from the vault and the vault's accrued position in the market.

## Parameters

### vault

`` `0x${string}` ``

MetaMorpho vault address.

### marketId

[`MarketId`](../../../blue-sdk/src/type-aliases/MarketId.md)

Market id whose allocation is fetched.

### client

`Client`

Viem client used for deployless reads or multicalls.

### parameters?

[`DeploylessFetchParameters`](../type-aliases/DeploylessFetchParameters.md) = `{}`

## Returns

`Promise`\<[`VaultMarketAllocation`](../../../blue-sdk/src/classes/VaultMarketAllocation.md)\>

The hydrated `VaultMarketAllocation` entity.

## Example

```ts
import type { MarketId, VaultMarketAllocation } from "@morpho-org/blue-sdk";
import { fetchVaultMarketAllocation } from "@morpho-org/blue-sdk-viem";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const client = createPublicClient({ chain: mainnet, transport: http() });
const vault = "0x9a8bC3B04b7f3D87cfC09ba407dCED575f2d61D8";
const marketId =
  "0xdba352c33d64fc9bff091d505dbfcbc6c41b89986c2193b22a90031e9dac7f76" as MarketId;

const allocation: VaultMarketAllocation = await fetchVaultMarketAllocation(
  vault,
  marketId,
  client,
);
```
