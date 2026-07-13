---
"@morpho-org/morpho-sdk": minor
---

Fix Blue shares-mode repay so a `nativeAmount` that covers the full debt no longer emits a spurious loan-token approval requirement.

`MorphoBlue.repay` / `repayWithdrawCollateral` derive the ERC-20 pulled in shares mode from the 2h-forward-accrued, rounded-up `toBorrowAssets(shares)`. Previously the entity threw `NativeAmountExceedsTransferAmountError` when `nativeAmount` exceeded that upper bound and always computed `erc20Amount = borrowAssets - nativeAmount`, so a repay funded entirely by native ETH left a tiny positive residual and `getRequirements()` returned a wNative approval/permit requirement that was never actually needed.

The ERC-20 pulled is now clamped: `erc20Amount = max(0, borrowAssets - nativeAmount)`. When native covers (or exceeds) the borrow assets, nothing is pulled as ERC-20 — the bundle wraps the native and skims any residual wNative back to the receiver (the existing shares-mode skim) — so a fully-native shares repay emits no loan-token approval requirement.

`NativeAmountExceedsTransferAmountError` is now deprecated (no longer thrown) and will be removed in the next major.
