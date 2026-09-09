[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / vaultV1Redeem

# Function: vaultV1Redeem()

> **vaultV1Redeem**(`__namedParameters`): `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`VaultV1RedeemAction`](../interfaces/VaultV1RedeemAction.md)\>\>

Defined in: [packages/morpho-sdk/src/actions/vaultV1/redeem.ts:49](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/vaultV1/redeem.ts#L49)

Prepares a redeem transaction for a VaultV1 (MetaMorpho) contract.

Direct vault call — no bundler needed. Redeem has no inflation-attack surface.

## Parameters

### \_\_namedParameters

[`VaultV1RedeemParams`](../interfaces/VaultV1RedeemParams.md)

## Returns

`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`VaultV1RedeemAction`](../interfaces/VaultV1RedeemAction.md)\>\>

A deep-frozen `Transaction<VaultV1RedeemAction>` with `to`, `value`, `data`, and the
  typed `action` discriminator the simulation layer consumes.

## Throws

when `shares <= 0n`.

## Example

```ts
import { vaultV1Redeem } from "@morpho-org/morpho-sdk";

const tx = vaultV1Redeem({
  vault: { address: vaultAddress },
  args: { shares: 1_000_000n, recipient, onBehalf },
});
// tx satisfies Readonly<Transaction<VaultV1RedeemAction>>
```
