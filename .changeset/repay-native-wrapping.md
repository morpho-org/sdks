---
"@morpho-org/morpho-sdk": major
"@morpho-org/wdk-protocol-lending-morpho-evm": patch
"@morpho-org/liquidity-sdk-viem": patch
---

Add native (wNative) wrapping to the Blue repay flows and reshape their amount args, matching the `blueSupply` devex.

`MorphoBlue.repay` / `repayWithdrawCollateral` (entity) now take:

- **assets mode** — `{ amount, nativeAmount? }`. Additive like `blueSupply`: the repaid assets are `amount + nativeAmount`, the ERC-20 pulled is `amount`, and `nativeAmount` is wrapped into wNative.
- **shares mode** — `{ shares, nativeAmount? }`. Repays exact shares; the entity derives the ERC-20 pulled as `toBorrowAssets(shares) − nativeAmount` from live market state, wraps `nativeAmount`, and skims residual loan tokens back to `receiver`.

`blueRepay` / `blueRepayWithdrawCollateral` (action) take a **flat, pre-resolved** shape `{ amount?, shares?, nativeAmount?, transferAmount }` — the action does no amount arithmetic. Assets mode repays `transferAmount` (= `amount + nativeAmount`) and pulls `amount`; shares mode repays `shares` and pulls `transferAmount` ERC-20 (already net of native).

`nativeAmount` requires the market's loan token to be the chain's wNative. A fully-native repay pulls no ERC-20 and emits no approval requirement.

**Breaking changes (migration):**

- Assets mode renames `assets` → `amount`: replace `repay({ assets })` with `repay({ amount })`.
- The action args of `blueRepay` / `blueRepayWithdrawCollateral` are now the flat `RepayActionAmountArgs` (`{ amount?, shares?, nativeAmount?, transferAmount }`) instead of `{ assets, shares, transferAmount }`. Assets mode: pass `{ amount, transferAmount: amount + nativeAmount }`. Shares mode: pass `{ shares, transferAmount }` where `transferAmount` is the ERC-20 to pull (net of native).
- `RepayAmountArgs` is no longer a deprecated alias of `AssetsOrSharesArgs`; it is now the native-aware repay union (entity surface, `DepositAmountArgs | { shares }`). A new `RepayActionAmountArgs` is the flat action-layer shape. `AssetsOrSharesArgs` is unchanged and still used by `withdraw`.
- The `validateRepayParams` helper is removed; amount resolution now lives in the entity, and the action validates only its cheap invariants. Negative repay amounts are rejected consistently: a negative `amount` (assets mode) or a negative shares-mode `transferAmount` now throws `NonPositiveRepayAmountError` from both `getRequirements` and `buildTx`, instead of the entity leaking a negative approval.
- New exported error `NativeAmountExceedsTransferAmountError`, thrown when a shares-mode `nativeAmount` exceeds the loan assets to repay. The action layer validates its pre-resolved funding: assets mode requires `transferAmount === amount + nativeAmount` (`TransferAmountNotEqualToAssetsError`), shares mode requires positive funding (`transferAmount + nativeAmount > 0n`). `NonPositiveTransferAmountError` is retained as exported API but no longer thrown (deprecated, slated for removal in a future major).

`@morpho-org/wdk-protocol-lending-morpho-evm` is updated to the renamed `amount` field for its Morpho repay path.

`@morpho-org/liquidity-sdk-viem` bumps its `@morpho-org/morpho-sdk` peer dependency range to `^5.0.0` to track the new major.
