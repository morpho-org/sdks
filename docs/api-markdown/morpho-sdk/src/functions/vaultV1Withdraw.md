[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / vaultV1Withdraw

# Function: vaultV1Withdraw()

> **vaultV1Withdraw**(`__namedParameters`): `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`VaultV1WithdrawAction`](../interfaces/VaultV1WithdrawAction.md)\>\>

Defined in: [packages/morpho-sdk/src/actions/vaultV1/withdraw.ts:49](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/vaultV1/withdraw.ts#L49)

Prepares a withdraw transaction for a VaultV1 (MetaMorpho) contract.

Direct vault call — no bundler needed. Withdraw has no inflation-attack surface.

## Parameters

### \_\_namedParameters

[`VaultV1WithdrawParams`](../interfaces/VaultV1WithdrawParams.md)

## Returns

`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`VaultV1WithdrawAction`](../interfaces/VaultV1WithdrawAction.md)\>\>

A deep-frozen `Transaction<VaultV1WithdrawAction>` with `to`, `value`, `data`, and the
  typed `action` discriminator the simulation layer consumes.

## Throws

when `amount <= 0n`.

## Example

```ts
import { vaultV1Withdraw } from "@morpho-org/morpho-sdk";

const tx = vaultV1Withdraw({
  vault: { address: vaultAddress },
  args: { amount: 500_000n, recipient, onBehalf },
});
// tx satisfies Readonly<Transaction<VaultV1WithdrawAction>>
```
