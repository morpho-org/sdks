[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / vaultV2Redeem

# Function: vaultV2Redeem()

> **vaultV2Redeem**(`__namedParameters`): `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`VaultV2RedeemAction`](../interfaces/VaultV2RedeemAction.md)\>\>

Defined in: [packages/morpho-sdk/src/actions/vaultV2/redeem.ts:50](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/vaultV2/redeem.ts#L50)

Prepares a redeem transaction for a VaultV2 contract.

Direct vault call — not routed through the bundler. Redeem has no inflation-attack surface,
so skipping the bundler avoids an unnecessary approval and keeps the UX clean.

## Parameters

### \_\_namedParameters

[`VaultV2RedeemParams`](../interfaces/VaultV2RedeemParams.md)

## Returns

`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`VaultV2RedeemAction`](../interfaces/VaultV2RedeemAction.md)\>\>

A deep-frozen `Transaction<VaultV2RedeemAction>` with `to`, `value`, `data`, and the
  typed `action` discriminator the simulation layer consumes.

## Throws

when `shares <= 0n`.

## Example

```ts
import { vaultV2Redeem } from "@morpho-org/morpho-sdk";

const tx = vaultV2Redeem({
  vault: { address: vaultAddress },
  args: { shares: 1_000_000n, recipient, onBehalf },
});
// tx satisfies Readonly<Transaction<VaultV2RedeemAction>>
```
