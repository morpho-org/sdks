[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / vaultV2InKindRedeem

# Function: vaultV2InKindRedeem()

> **vaultV2InKindRedeem**(`params`): `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`VaultV2InKindRedeemAction`](../interfaces/VaultV2InKindRedeemAction.md)\>\>

Defined in: [packages/morpho-sdk/src/actions/vaultV2/inKindRedeem.ts:65](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/vaultV2/inKindRedeem.ts#L65)

Prepares a Vault V2 in-kind redemption into idle assets and Morpho Blue supply positions.

`amount` includes the Vault V2 force-deallocation penalty. Without a signature this embeds the
empty-permit sentinel and requires a sufficient share approval to VaultExitBundlesV1.

## Parameters

### params

[`VaultV2InKindRedeemParams`](../interfaces/VaultV2InKindRedeemParams.md)

In-kind redemption parameters.

## Returns

`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`VaultV2InKindRedeemAction`](../interfaces/VaultV2InKindRedeemAction.md)\>\>

A deep-frozen `Readonly<Transaction<VaultV2InKindRedeemAction>>` with `to`, `value`,
  `data`, and the typed action discriminator.

## Throws

when `amount` or `deadline` is not positive.

## Throws

when no address registry exists for the target chain.

## Throws

when VaultExitBundlesV1 is not registered on the target chain.

## Throws

when the requirement has the wrong permit kind, asset, or signature encoding.

## Example

```ts
import { vaultV2InKindRedeem } from "@morpho-org/morpho-sdk";

const tx = vaultV2InKindRedeem({
  vault: { chainId: 1, address: vault },
  args: { adapter, amount: 1_000_000n, marketParamsList, userAddress, deadline },
});
// tx satisfies Readonly<Transaction<VaultV2InKindRedeemAction>>
```
