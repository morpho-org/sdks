[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / vaultV1MigrateToV2

# Function: vaultV1MigrateToV2()

> **vaultV1MigrateToV2**(`__namedParameters`): `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`VaultV1MigrateToV2Action`](../interfaces/VaultV1MigrateToV2Action.md)\>\>

Defined in: [packages/morpho-sdk/src/actions/vaultV1/migrateToV2.ts:100](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/vaultV1/migrateToV2.ts#L100)

Prepares an atomic full-migration transaction from VaultV1 to VaultV2.

Routed through bundler3: transfers V1 shares to `GeneralAdapter1` (via `erc20TransferFrom` or
permit/permit2), redeems them via `erc4626Redeem` (GA1 redeems its own shares — no allowance
check), then deposits the resulting assets into V2 via `erc4626Deposit`. All operations
execute atomically in a single transaction.

Prerequisite: the user must either approve `GeneralAdapter1` to spend their V1 vault shares
(classic approve) or provide a pre-signed permit/permit2 via `requirementSignature`. Use
`getRequirements()` on the entity to resolve the appropriate approval.

## Parameters

### \_\_namedParameters

[`VaultV1MigrateToV2Params`](../interfaces/VaultV1MigrateToV2Params.md)

## Returns

`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`VaultV1MigrateToV2Action`](../interfaces/VaultV1MigrateToV2Action.md)\>\>

A deep-frozen `Transaction<VaultV1MigrateToV2Action>` with `to`, `value`, `data`, and
  the typed `action` discriminator the simulation layer consumes.

## Throws

when `targetAsset` differs from `vault.asset`.

## Throws

when `shares <= 0n` or `maxSharePriceVaultV2 <= 0n`.

## Throws

when `minSharePriceVaultV1 < 0n`.

## Throws

from `getTokenRequirementActions` when `requirementSignature`
  is provided and the signed asset differs from `vault.address` (the V1 share token).

## Throws

from `getTokenRequirementActions` when `requirementSignature`
  is provided and the signed amount differs from `args.shares`.

## Throws

from `getTokenRequirementActions` when a Permit2 requirement
  signature is missing its expiration.

## Example

```ts
import { vaultV1MigrateToV2 } from "@morpho-org/morpho-sdk";

const tx = vaultV1MigrateToV2({
  vault: { chainId: 1, address: sourceVault, asset: USDC },
  args: {
    targetVault,
    targetAsset: USDC,
    shares: 1_000_000n,
    minSharePriceVaultV1: 0n, // disables redeem-leg slippage protection — production code should compute from source vault state + slippage tolerance
    maxSharePriceVaultV2: 1_010_000_000_000_000_000_000_000_000n, // RAY-scaled, 1.01x
    recipient,
  },
});
// tx satisfies Readonly<Transaction<VaultV1MigrateToV2Action>>
```
