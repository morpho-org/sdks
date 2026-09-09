[**@morpho-org/sdks**](../../../README.md)

***

[@morpho-org/sdks](../../../README.md) / [morpho-sdk/src](../README.md) / vaultV1Deposit

# Function: vaultV1Deposit()

> **vaultV1Deposit**(`__namedParameters`): `Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`VaultV1DepositAction`](../interfaces/VaultV1DepositAction.md)\>\>

Defined in: [packages/morpho-sdk/src/actions/vaultV1/deposit.ts:88](https://github.com/morpho-org/sdks/blob/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8/packages/morpho-sdk/src/actions/vaultV1/deposit.ts#L88)

Prepares a deposit transaction for a VaultV1 (MetaMorpho) contract.

Routed through bundler3 to atomically execute the asset transfer and vault deposit. The
`GeneralAdapter1` enforces `maxSharePrice` on-chain to prevent inflation attacks. Never bypass
the general adapter.

When `nativeAmount > 0`, that amount of native ETH is sent as `msg.value` to the bundler3
multicall and wrapped into wNative via `GeneralAdapter1.wrapNative()`. The vault's underlying
asset must be the chain's wrapped native token.

## Parameters

### \_\_namedParameters

[`VaultV1DepositParams`](../interfaces/VaultV1DepositParams.md)

## Returns

`Readonly`\<[`Transaction`](../interfaces/Transaction.md)\<[`VaultV1DepositAction`](../interfaces/VaultV1DepositAction.md)\>\>

A deep-frozen `Transaction<VaultV1DepositAction>` with `to`, `value`, `data`, and the
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
import { vaultV1Deposit } from "@morpho-org/morpho-sdk";

const tx = vaultV1Deposit({
  vault: { chainId: 1, address: vaultAddress, asset: USDC },
  args: {
    amount: 1_000_000n,
    maxSharePrice: 1_010_000_000_000_000_000_000_000_000n, // RAY-scaled, 1.01x
    recipient: depositor,
  },
});
// tx satisfies Readonly<Transaction<VaultV1DepositAction>>
```
