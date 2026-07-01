---
"@morpho-org/morpho-sdk": major
"@morpho-org/wdk-protocol-lending-morpho-evm": patch
---

Add native (wNative) wrapping to the Blue repay flows and reshape their amount args to a discriminated union, matching the `blueSupply` devex.

`blueRepay` / `blueRepayWithdrawCollateral` (and the `MorphoBlue.repay` / `repayWithdrawCollateral` entity methods) now take:

- **assets mode** — `{ amount, nativeAmount? }`. Additive like `blueSupply`: the repaid assets are `amount + nativeAmount`, the ERC-20 pulled is `amount`, and `nativeAmount` is wrapped into wNative.
- **shares mode** — `{ shares, nativeAmount? }` at the entity layer (`transferAmount` is computed from live market state) or `{ shares, transferAmount, nativeAmount? }` at the action layer. The ERC-20 pulled is `transferAmount − nativeAmount`; residual loan tokens are skimmed back to `receiver`.

`nativeAmount` requires the market's loan token to be the chain's wNative. A fully-native repay pulls no ERC-20 and emits no approval requirement.

**Breaking changes (migration):**

- Assets mode renames `assets` → `amount`. Replace `repay({ assets })` with `repay({ amount })` and `blueRepay({ args: { assets, shares: 0n, transferAmount } })` with `blueRepay({ args: { amount } })`.
- Action-layer shares mode no longer takes a flat `{ assets: 0n, shares, transferAmount }` object; pass `{ shares, transferAmount }`.
- `RepayAmountArgs` is no longer a deprecated alias of `AssetsOrSharesArgs`; it is now the native-aware repay union (entity surface). A new `RepayActionAmountArgs` carries the action-layer `transferAmount`. `AssetsOrSharesArgs` is unchanged and still used by `withdraw`.
- The `validateRepayParams` helper is replaced by `resolveRepayAmounts`, which validates and derives the repay/transfer/native amounts.
- New exported error `NativeAmountExceedsTransferAmountError`, thrown when a shares-mode `nativeAmount` exceeds `transferAmount`. `TransferAmountNotEqualToAssetsError` is retained but no longer thrown (assets mode no longer takes a separate `transferAmount`).

`@morpho-org/wdk-protocol-lending-morpho-evm` is updated to the renamed `amount` field for its Morpho repay path.
