[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / vaultV1InKindRedeem

# Function: vaultV1InKindRedeem()

> **vaultV1InKindRedeem**(`params`): `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`VaultV1InKindRedeemAction`](../interfaces/VaultV1InKindRedeemAction.md)\>\>

Defined in: [packages/morpho-sdk/src/actions/vaultV1/inKindRedeem.ts:64](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/vaultV1/inKindRedeem.ts#L64)

Prepares a Vault V1 in-kind redemption into Morpho Blue supply positions.

The transaction calls VaultExitBundlesV1 directly. Without a signature it embeds the contract's
empty-permit sentinel; the user must first approve enough shares for the exit.

## Parameters

### params

[`VaultV1InKindRedeemParams`](../interfaces/VaultV1InKindRedeemParams.md)

In-kind redemption parameters.

## Returns

`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`VaultV1InKindRedeemAction`](../interfaces/VaultV1InKindRedeemAction.md)\>\>

A deep-frozen `Readonly<Transaction<VaultV1InKindRedeemAction>>` with `to`, `value`,
  `data`, and the typed action discriminator.

## Throws

when `amount` or `deadline` is not positive.

## Throws

when no markets are supplied.

## Throws

when no address registry exists for the target chain.

## Throws

when VaultExitBundlesV1 is not registered on the target chain.

## Throws

when the requirement has the wrong permit kind, asset, or signature encoding.

## Example

```ts
import { vaultV1InKindRedeem } from "@morpho-org/morpho-sdk";

const tx = vaultV1InKindRedeem({
  vault: { chainId: 1, address: vault },
  args: { amount: 1_000_000n, marketParamsList, userAddress, deadline },
});
// tx satisfies Readonly<Transaction<VaultV1InKindRedeemAction>>
```
