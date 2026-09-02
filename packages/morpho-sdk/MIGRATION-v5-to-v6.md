# Migrating `@morpho-org/morpho-sdk` from v5 to v6

Version 6 reshapes Vault V2 `forceWithdraw` to route through the standalone `VaultExitBundlesV1`
periphery. This guide covers that breaking change; other v6 breaks are documented by their own
changesets as they land.

## Vault V2 `forceWithdraw`

`MorphoVaultV2.forceWithdraw` and the pure `vaultV2ForceWithdraw` action now route through the
standalone `VaultExitBundlesV1` periphery instead of a `VaultV2.multicall` of caller-supplied
`forceDeallocate` calls. The contract computes its own deallocations and bounds the realized exit
share price. `forceRedeem` is unchanged and stays on the vault multicall.

| Was (v5) | Now (v6) |
| --- | --- |
| `forceWithdraw({ deallocations, withdraw: { amount }, userAddress })` | `forceWithdraw({ exitAssets, vaultData, userAddress, adapter?, deadline?, slippageTolerance?, minSharePriceE27?, referralFeePct?, referralFeeRecipient? })` |
| Returns `{ buildTx }` | Returns an `ActionOutput` — `{ getRequirements(), buildTx(signatures?) }` (`buildTx` stays synchronous) |
| `withdraw.amount` was the net payout | `exitAssets` is **penalty-inclusive**; quote the split with the new `previewVaultV2ForceWithdraw` |
| `tx.to` is the vault | `tx.to` is `VaultExitBundlesV1` |
| No approval needed (the vault burned `msg.sender`'s own shares) | A vault-share allowance or ERC-2612 permit **to `VaultExitBundlesV1`** is now required |

Migration steps:

- Fetch a `vaultData` snapshot (`vault.getData()`) and pass it in. The vault must have exactly one
  `MorphoMarketV1AdapterV2` and route liquidity through that same adapter or none; multi-adapter and
  legacy-adapter vaults must use `forceRedeem` or a plain `withdraw`.
- Convert your net-payout amount to a penalty-inclusive `exitAssets` and drop the caller-supplied
  `deallocations` and market ordering — the contract derives them.
- Resolve `getRequirements()` before `buildTx()` to obtain the new vault-share approval or permit to
  `VaultExitBundlesV1`, and make sure the vault's `receiveAssetsGate` allows that periphery.
- Update `VaultV2ForceWithdrawAction` decoding: `deallocations` and `withdraw` are gone; `adapter`,
  `exitAssets`, `minSharePriceE27`, `referralFeePct`, `referralFeeRecipient`, and `deadline` are new.
- `InKindRedeemRequiresSingleAdapterError` and `UnsupportedInKindAdapterError` are deprecated aliases
  of `VaultV2SingleAdapterRequiredError` and `VaultV2UnsupportedExitAdapterError`; `instanceof` keeps
  working for both names.

See the `vault-v2-force-withdraw-via-vault-exit-bundles` changeset and
`docs/tibs/TIB-2026-08-28-vault-exit-force-withdraw.md` for the full record.

## Upgrade checklist

- Migrate Vault V2 `forceWithdraw` to the penalty-inclusive `exitAssets` + `vaultData` shape,
  resolve its new `getRequirements()`, and authorize vault shares to `VaultExitBundlesV1`.
- Update transaction decoding, simulation fixtures, and action metadata fields; the
  `VaultV2ForceWithdrawAction` discriminator name remains stable.
- Test the multi-adapter and legacy-adapter fallbacks (`forceRedeem` / plain `withdraw`) used by the
  application.
