[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / fetchAccrualVaultV2

# Function: fetchAccrualVaultV2()

> **fetchAccrualVaultV2**(`address`, `client`, `__namedParameters?`): `Promise`\<[`AccrualVaultV2`](../../../blue-sdk/src/classes/AccrualVaultV2.md)\>

Defined in: [packages/blue-sdk-viem/src/fetch/vault-v2/VaultV2.ts:447](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/fetch/vault-v2/VaultV2.ts#L447)

Fetches VaultV2 state with accrual data for capacity calculations.

Reads all state fetched by `fetchVaultV2`, the vault asset balance, accrual state for the
configured liquidity adapter and regular adapters, and force-deallocate penalties. By default it
reads the entire tree in a single deployless call and only falls back to sequential multicall
reads when that call fails; pass `deployless: "force"` to require the single call, or
`deployless: false` to use multicall reads directly.

`MorphoMarketV1Adapter` has zero support as a VaultV2 liquidity adapter. This fetcher may hydrate
that adapter as an accrual adapter, but liquidity cap allocations remain undefined because
`fetchVaultV2` only loads allocations for `MorphoVaultV1Adapter` and
`MorphoMarketV1AdapterV2`. Calling `maxDeposit` on the returned `AccrualVaultV2` therefore throws
`VaultV2Errors.UnsupportedLiquidityAdapter` for a non-V2 market adapter liquidity adapter.

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

`Promise`\<[`AccrualVaultV2`](../../../blue-sdk/src/classes/AccrualVaultV2.md)\>

The hydrated `AccrualVaultV2` entity with asset balance, accrual adapters, and
  force-deallocate penalties.

## Throws

when the configured chain has no VaultV2 factory.

## Throws

when `address` is not a VaultV2 from the configured factory.

## Throws

when the vault or one of its adapters uses an
  unsupported adapter class.

## Throws

when a read fails with no fallback left (`deployless: "force"`, or a
  multicall read when `deployless: false`).

## Example

```ts
import type { AccrualVaultV2 } from "@morpho-org/blue-sdk";
import { fetchAccrualVaultV2 } from "@morpho-org/blue-sdk-viem";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

const client = createPublicClient({ chain: base, transport: http() });
const vaultV2Address = "0xfDE48B9B8568189f629Bc5209bf5FA826336557a";

const vault: AccrualVaultV2 = await fetchAccrualVaultV2(vaultV2Address, client);
```
