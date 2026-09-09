[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / vaultV2ForceWithdraw

# Function: vaultV2ForceWithdraw()

> **vaultV2ForceWithdraw**(`__namedParameters`): `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`VaultV2ForceWithdrawAction`](../interfaces/VaultV2ForceWithdrawAction.md)\>\>

Defined in: [packages/morpho-sdk/src/actions/vaultV2/forceWithdraw.ts:71](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/vaultV2/forceWithdraw.ts#L71)

Prepares a force-withdraw transaction for a VaultV2 contract via the vault's native `multicall`.

Encodes one or more `forceDeallocate` calls followed by a single `withdraw`, executed
atomically through VaultV2's `multicall`. Frees liquidity from non-liquidity adapters and
withdraws the resulting assets in one transaction.

A penalty is taken from `onBehalf` for each deallocation to discourage allocation
manipulation. The penalty is applied as a share burn where assets are returned to the vault,
so the share price stays stable (except for rounding).

## Parameters

### \_\_namedParameters

[`VaultV2ForceWithdrawParams`](../interfaces/VaultV2ForceWithdrawParams.md)

## Returns

`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`VaultV2ForceWithdrawAction`](../interfaces/VaultV2ForceWithdrawAction.md)\>\>

A deep-frozen `Transaction<VaultV2ForceWithdrawAction>` with `to`, `value`, `data`,
  and the typed `action` discriminator the simulation layer consumes.

## Throws

when `deallocations` is empty.

## Throws

when `withdraw.amount <= 0n`, or when any
  `deallocations[i].amount <= 0n` (raised by `encodeForceDeallocateCall`).

## Example

```ts
import { vaultV2ForceWithdraw } from "@morpho-org/morpho-sdk";

const tx = vaultV2ForceWithdraw({
  vault: { address: vaultAddress },
  args: {
    deallocations: [{ adapter, marketParams, amount: 500_000n }],
    withdraw: { amount: 500_000n, recipient },
    onBehalf,
  },
});
// tx satisfies Readonly<Transaction<VaultV2ForceWithdrawAction>>
```
