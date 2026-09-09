[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / vaultV2Withdraw

# Function: vaultV2Withdraw()

> **vaultV2Withdraw**(`__namedParameters`): `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`VaultV2WithdrawAction`](../interfaces/VaultV2WithdrawAction.md)\>\>

Defined in: [packages/morpho-sdk/src/actions/vaultV2/withdraw.ts:50](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/vaultV2/withdraw.ts#L50)

Prepares a withdraw transaction for a VaultV2 contract.

Direct vault call — not routed through the bundler. Withdraw has no inflation-attack surface,
so skipping the bundler avoids an unnecessary approval and keeps the UX clean.

## Parameters

### \_\_namedParameters

[`VaultV2WithdrawParams`](../interfaces/VaultV2WithdrawParams.md)

## Returns

`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`VaultV2WithdrawAction`](../interfaces/VaultV2WithdrawAction.md)\>\>

A deep-frozen `Transaction<VaultV2WithdrawAction>` with `to`, `value`, `data`, and the
  typed `action` discriminator the simulation layer consumes.

## Throws

when `amount <= 0n`.

## Example

```ts
import { vaultV2Withdraw } from "@morpho-org/morpho-sdk";

const tx = vaultV2Withdraw({
  vault: { address: vaultAddress },
  args: { amount: 500_000n, recipient, onBehalf },
});
// tx satisfies Readonly<Transaction<VaultV2WithdrawAction>>
```
