[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [blue-sdk-viem/src](../README.md) / fetchAccrualVaultV2Deployless

# ~~Function: fetchAccrualVaultV2Deployless()~~

> **fetchAccrualVaultV2Deployless**(`address`, `client`, `parameters?`): `Promise`\<[`AccrualVaultV2`](../../../blue-sdk/src/classes/AccrualVaultV2.md)\>

Defined in: [packages/blue-sdk-viem/src/fetch/vault-v2/VaultV2.ts:777](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/blue-sdk-viem/src/fetch/vault-v2/VaultV2.ts#L777)

Fetches the full VaultV2 accrual tree in a single deployless call.

[fetchAccrualVaultV2](fetchAccrualVaultV2.md) defaults to this same single deployless call but transparently falls
back to sequential multicall reads (vault, then each adapter, then each adapter's markets or
wrapped MetaMorpho V1 vault) when the deployless read fails. This reader is deployless-only: it
always performs the single `eth_call`, never falls back, and throws if the deployless read fails
(equivalent to `deployless: "force"`). It requires every configured adapter factory to be deployed
at the queried block.

The returned `AccrualVaultV2` is byte-for-byte identical to `fetchAccrualVaultV2`'s output,
including the nested MetaMorpho V1 vault of a `MorphoVaultV1Adapter`: its EIP-5267 domain
(`eip5267Domain`) and PublicAllocator config (both vault-level and per-market
`publicAllocatorConfig`) are read in the same single call, so no field is dropped.

## Parameters

### address

`` `0x${string}` ``

Address of the VaultV2 to fetch.

### client

`Client`

Viem client used for the deployless read.

### parameters?

[`FetchParameters`](../type-aliases/FetchParameters.md) = `{}`

## Returns

`Promise`\<[`AccrualVaultV2`](../../../blue-sdk/src/classes/AccrualVaultV2.md)\>

The hydrated `AccrualVaultV2` entity with asset balance, accrued liquidity and regular
  adapters, and force-deallocate penalties.

## Throws

when the configured chain has no VaultV2 factory.

## Throws

when `address` is not a VaultV2 from the configured factory.

## Throws

when the vault or one of its adapters uses an unsupported
  adapter class.

## Throws

when the deployless `eth_call` or response decoding fails (no fallback).

## Deprecated

Use [fetchAccrualVaultV2](fetchAccrualVaultV2.md), which is deployless-first with RPC fallback by
  default. Pass `deployless: "force"` to preserve this function's no-fallback behavior.

## Example

```ts
import type { AccrualVaultV2 } from "@morpho-org/blue-sdk";
import { fetchAccrualVaultV2Deployless } from "@morpho-org/blue-sdk-viem";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";

const client = createPublicClient({ chain: base, transport: http() });
const vaultV2Address = "0xfDE48B9B8568189f629Bc5209bf5FA826336557a";

const vault: AccrualVaultV2 = await fetchAccrualVaultV2Deployless(
  vaultV2Address,
  client,
);
```
