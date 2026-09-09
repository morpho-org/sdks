[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / fetchVaultV2

# Function: fetchVaultV2()

> **fetchVaultV2**(`address`, `client`, `__namedParameters?`): `Promise`\<[`VaultV2`](../../../blue-sdk/src/classes/VaultV2.md)\>

Defined in: [packages/blue-sdk-viem/src/fetch/vault-v2/VaultV2.ts:101](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/fetch/vault-v2/VaultV2.ts#L101)

Fetches VaultV2 state and liquidity-cap data.

Reads token metadata, vault accounting, fee configuration and recipient share eligibility,
adapter addresses, the configured liquidity adapter, liquidity data, and cap allocations for
supported liquidity adapters. Uses the deployless `GetVaultV2` query by default and falls back
to multicall when allowed.

`MorphoMarketV1Adapter` has zero support as a VaultV2 liquidity adapter. This fetcher only loads
liquidity allocations for `MorphoVaultV1Adapter` and `MorphoMarketV1AdapterV2`; when a vault
configures the non-V2 market adapter as `liquidityAdapter`, the returned `VaultV2` preserves the
adapter address and liquidity data but leaves `liquidityAllocations` undefined. Fetch
`MorphoMarketV1Adapter` through `fetchVaultV2Adapter` when it is used as a regular adapter.

## Parameters

### address

`` `0x${string}` ``

Address of the VaultV2 to fetch.

### client

`Client`

Viem client used for deployless reads or multicalls.

### \_\_namedParameters?

[`DeploylessFetchParameters`](../type-aliases/DeploylessFetchParameters.md) = `{}`

## Returns

`Promise`\<[`VaultV2`](../../../blue-sdk/src/classes/VaultV2.md)\>

The hydrated `VaultV2` entity. `liquidityAllocations` is undefined when no liquidity
  adapter is configured or when the configured liquidity adapter is unsupported.

## Throws

when the configured chain has no VaultV2 factory.

## Throws

when `address` is not a VaultV2 from the configured factory.

## Throws

when a recognized liquidity adapter is configured with
  unsupported liquidity data.

## Example

```ts
import type { VaultV2 } from "@morpho-org/blue-sdk";
import { fetchVaultV2 } from "@morpho-org/blue-sdk-viem";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

const client = createPublicClient({ chain: base, transport: http() });
const vaultV2Address = "0xfDE48B9B8568189f629Bc5209bf5FA826336557a";

const vault: VaultV2 = await fetchVaultV2(vaultV2Address, client);
```
