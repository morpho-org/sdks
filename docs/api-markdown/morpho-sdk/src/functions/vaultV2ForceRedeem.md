[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / vaultV2ForceRedeem

# Function: vaultV2ForceRedeem()

> **vaultV2ForceRedeem**(`__namedParameters`): `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`VaultV2ForceRedeemAction`](../interfaces/VaultV2ForceRedeemAction.md)\>\>

Defined in: [packages/morpho-sdk/src/actions/vaultV2/forceRedeem.ts:75](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/vaultV2/forceRedeem.ts#L75)

Prepares a force-redeem transaction for a VaultV2 contract via the vault's native `multicall`.

Encodes one or more `forceDeallocate` calls followed by a single `redeem`, executed atomically
through VaultV2's `multicall`. Share-based counterpart to [vaultV2ForceWithdraw](vaultV2ForceWithdraw.md) — use
when the user wants to redeem an exact share amount rather than withdraw exact assets.

The total assets passed to `forceDeallocate` calls must be greater than or equal to the
asset-equivalent of the redeemed shares. The caller should apply a buffer on the deallocated
amounts to absorb share-price drift between submission and execution.

A penalty is taken from `onBehalf` for each deallocation to discourage allocation
manipulation. The penalty is applied as a share burn where assets are returned to the vault,
so the share price stays stable (except for rounding).

## Parameters

### \_\_namedParameters

[`VaultV2ForceRedeemParams`](../interfaces/VaultV2ForceRedeemParams.md)

## Returns

`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`VaultV2ForceRedeemAction`](../interfaces/VaultV2ForceRedeemAction.md)\>\>

A deep-frozen `Transaction<VaultV2ForceRedeemAction>` with `to`, `value`, `data`, and
  the typed `action` discriminator the simulation layer consumes.

## Throws

when `deallocations` is empty.

## Throws

when `redeem.shares <= 0n` or any deallocation amount is
  non-positive.

## Example

```ts
import { vaultV2ForceRedeem } from "@morpho-org/morpho-sdk";

const tx = vaultV2ForceRedeem({
  vault: { address: vaultAddress },
  args: {
    deallocations: [{ adapter, marketParams, amount: 1_010_000n }],
    redeem: { shares: 1_000_000n, recipient },
    onBehalf,
  },
});
// tx satisfies Readonly<Transaction<VaultV2ForceRedeemAction>>
```
