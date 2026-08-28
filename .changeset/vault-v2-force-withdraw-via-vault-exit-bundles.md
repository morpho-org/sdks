---
"@morpho-org/morpho-sdk": major
"@morpho-org/liquidity-sdk-viem": patch
---

Migrate Vault V2 `forceWithdraw` from `VaultV2.multicall` to `VaultExitBundlesV1`.

`vaultV2ForceWithdraw` and `MorphoVaultV2.forceWithdraw` now encode
`vaultExitBundlesV1ForceWithdrawVaultV2` instead of a `VaultV2.multicall` of caller-supplied
`forceDeallocate` calls. The contract computes its own deallocations by walking the adapter's market
list, withdraws the vault's idle assets and liquidity-adapter liquidity without a penalty first, and
bounds the realized exit share price. `forceRedeem` is unchanged and stays on the vault multicall.

**Breaking changes**

- `MorphoVaultV2.forceWithdraw` takes `{ exitAssets, vaultData, userAddress, adapter?, deadline?,
  slippageTolerance?, minSharePriceE27?, referralFeePct?, referralFeeRecipient? }` instead of
  `{ deallocations, withdraw: { amount }, userAddress }`. `vaultData` is now required.
- It returns an `ActionOutput` — `{ getRequirements(), buildTx(signatures?) }` — instead of
  `{ buildTx() }`. `buildTx` stays synchronous.
- **`exitAssets` is penalty-inclusive**, where `withdraw.amount` was the net payout. The assets
  delivered are `assetsToWithdraw + floor((exitAssets - assetsToWithdraw) * WAD / (WAD + penalty))`
  minus the referral fee. Use the new `previewVaultV2ForceWithdraw` to quote the split.
- `tx.to` is now VaultExitBundlesV1 rather than the vault.
- **New prerequisite: a vault-share allowance or ERC-2612 permit to VaultExitBundlesV1.** The
  multicall path needed none because the vault burned `msg.sender`'s own shares.
- `VaultV2ForceWithdrawAction.args` is reshaped: `deallocations` and `withdraw` are gone; `adapter`,
  `exitAssets`, `minSharePriceE27`, `referralFeePct`, `referralFeeRecipient`, and `deadline` are new.
- The caller no longer chooses markets or their order.
- The vault must have exactly one `MorphoMarketV1AdapterV2` and route liquidity through that same
  adapter or none at all. Multi-adapter vaults and vaults on the legacy positions-based
  `MorphoMarketV1Adapter` or a `MorphoVaultV1Adapter` must use `forceRedeem` or a plain `withdraw`.
- The vault's `receiveAssetsGate` must allow VaultExitBundlesV1 as an asset recipient.
- Only one VaultExitBundlesV1 call can execute per transaction (its `initiator` guard is transient
  and never cleared).
- `InKindRedeemRequiresSingleAdapterError` and `UnsupportedInKindAdapterError` are deprecated aliases
  of the new canonical `VaultV2SingleAdapterRequiredError` and `VaultV2UnsupportedExitAdapterError`;
  `instanceof` keeps working for both names.

**Additions**

- `minSharePriceE27` is derived from the vault snapshot and `slippageTolerance` (default
  `DEFAULT_SLIPPAGE_TOLERANCE`, capped by `MAX_SLIPPAGE_TOLERANCE`) and overridable. The multicall
  path had no slippage bound at all; the derived one rejects a share-price drop, a penalty increase,
  and liquidity shifting from the penalty-free leg to the penalised leg. It does not cover the
  referral fee, which the contract deducts after the check.
- The derived bound's denominator is the **snapshot** share burn, not the deadline-inflated allowance
  bound. A larger denominator only lowers the floor, so reusing the allowance would let a
  caller-chosen `deadline` silently weaken the price floor; `slippageTolerance` absorbs accrual drift
  instead.
- A supplied `minSharePriceE27` override must be positive: the contract reads `0` as "no bound", so
  an override can no longer opt out of the slippage check. A non-positive override throws
  `NonPositiveInputError`.
- Referral-fee inputs are validated eagerly at handle creation, before any RPC: `referralFeePct < 0`
  throws `NegativeInputError`, `referralFeePct >= WAD` throws `InputExceedsMaxError`, and a positive
  pct with a missing or zero recipient throws `MissingReferralFeeRecipientError`.
- `previewVaultV2ForceWithdraw(vaultData, params)` returns the penalty-free leg, penalised leg,
  penalty, referral fee, net payout, and `maxExitAssets`, with no RPC.
- `resolveVaultV2ForceWithdrawEligibility`, `computeVaultV2ForceWithdrawPlan`,
  `computeVaultV2ForceWithdrawSharesBurnt`, and `computeMinForceWithdrawSharePrice` expose the pure
  planning core.
- New errors: `VaultV2ForceWithdrawCoverageError` (replaces the contract's raw `panic 0x32` when the
  adapter's markets cannot cover the exit), `VaultV2ForceWithdrawZeroWithdrawalError`,
  `VaultV2UnsupportedLiquidityAdapterError`, `VaultV2UndecodableLiquidityDataError`, and
  `MissingReferralFeeRecipientError`. `VaultV2UndecodableLiquidityDataError` reports a
  `liquidityData` blob that does not decode as `MarketParams` — the case the contract's `abi.decode`
  reverts on — separately from `VaultV2UnsupportedLiquidityAdapterError`, which now covers only a
  liquidity adapter that is not the vault's sole adapter.
- The new share allowance is bounded to the exit's full burn — every penalty leg plus both asset
  legs, each rounded up independently, over the worse of the current and deadline-accrued previews.
  This is a bound on a **newly required** approval, not a replacement for one: the multicall path
  needed no approval at all, because the vault burned `msg.sender`'s own shares.

**Dependent packages**

- `@morpho-org/liquidity-sdk-viem` widens its `@morpho-org/morpho-sdk` peer range to `^6.0.0` and is
  released with this bump. The range is explicit rather than `workspace:^`, so Changesets cannot
  rewrite it automatically.

See `docs/tibs/TIB-2026-08-28-vault-exit-force-withdraw.md` for the full decision record.
