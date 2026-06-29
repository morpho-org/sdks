---
"@morpho-org/morpho-sdk": major
---

Reshape `blueRepay` funding to match `blueSupply` / `blueSupplyCollateral`, and add native wrapping.

`blueRepay` now expresses funding as `amount` (ERC-20) + `nativeAmount` (wrapped from native via `GeneralAdapter1.wrapNative()`), which sum to the amount pulled into `GeneralAdapter1` — the same `DepositAmountArgs` surface as the supply paths. The repaid amount is that sum in assets mode, or the exact `shares` in shares mode (where the sum is the upper-bound transfer and the residual is skimmed back to `receiver`). Native wrapping requires the market's loan token to be the chain's wNative.

**Breaking changes to `blueRepay` args:**

- Removed `assets` and `transferAmount`. Pass `amount` (and/or `nativeAmount`) instead; the transfer is derived as `amount + nativeAmount`.
- Mode is now selected by `shares`: omit (or `0n`) for an exact-asset repay, set `shares > 0` for a full repay.

```diff
- blueRepay({ market, args: { assets: 500n, shares: 0n, transferAmount: 500n, onBehalf, receiver, maxSharePrice } })
+ blueRepay({ market, args: { amount: 500n, onBehalf, receiver, maxSharePrice } })

- blueRepay({ market, args: { assets: 0n, shares, transferAmount: upperBound, onBehalf, receiver, maxSharePrice } })
+ blueRepay({ market, args: { amount: upperBound, shares, onBehalf, receiver, maxSharePrice } })
```

The `MorphoBlue.repay()` entity API is unchanged (`{ assets } | { shares }`). The `BlueRepayAction` result shape (`assets` / `shares` / `transferAmount`, plus `nativeAmount`) is unchanged.
