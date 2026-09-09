[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / vaultV2Deposit

# Function: vaultV2Deposit()

> **vaultV2Deposit**(`__namedParameters`): `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`VaultV2DepositAction`](../interfaces/VaultV2DepositAction.md)\>\>

Defined in: [packages/morpho-sdk/src/actions/vaultV2/deposit.ts:88](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/vaultV2/deposit.ts#L88)

Prepares a deposit transaction for a VaultV2 contract.

Routed through bundler3 to atomically execute the asset transfer and vault deposit. The
`GeneralAdapter1` enforces `maxSharePrice` on-chain to prevent inflation attacks. Never bypass
the general adapter.

When `nativeAmount > 0`, that amount of native ETH is sent as `msg.value` to the bundler3
multicall and wrapped into wNative via `GeneralAdapter1.wrapNative()`. The vault's underlying
asset must be the chain's wrapped native token.

## Parameters

### \_\_namedParameters

[`VaultV2DepositParams`](../interfaces/VaultV2DepositParams.md)

## Returns

`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`VaultV2DepositAction`](../interfaces/VaultV2DepositAction.md)\>\>

A deep-frozen `Transaction<VaultV2DepositAction>` with `to`, `value`, `data`, and the
  typed `action` discriminator the simulation layer consumes.

## Throws

when `amount < 0n` or `nativeAmount < 0n`.

## Throws

when `maxSharePrice <= 0n`, or when both `amount` and
  `nativeAmount` resolve to zero.

## Throws

when `nativeAmount` is provided but the chain has no
  configured wNative.

## Throws

when `nativeAmount` is provided but the vault
  asset is not the chain's wNative.

## Throws

from `getTokenRequirementActions` when `amount > 0n` and
  `requirementSignature` is provided and the signed asset differs from `vault.asset`. The
  signature is ignored on the native-only path (`amount === 0n` with `nativeAmount > 0n`).

## Throws

from `getTokenRequirementActions` when `amount > 0n` and
  `requirementSignature` is provided and the signed amount differs from `args.amount`.

## Throws

from `getTokenRequirementActions` when `amount > 0n` and a
  Permit2 requirement signature is missing its expiration.

## Example

```ts
import { vaultV2Deposit } from "@morpho-org/morpho-sdk";

const tx = vaultV2Deposit({
  vault: { chainId: 1, address: vaultAddress, asset: USDC },
  args: {
    amount: 1_000_000n,
    maxSharePrice: 1_010_000_000_000_000_000_000_000_000n, // RAY-scaled, 1.01x
    recipient: depositor,
  },
});
// tx satisfies Readonly<Transaction<VaultV2DepositAction>>
```
