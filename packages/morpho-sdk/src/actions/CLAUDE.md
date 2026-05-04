# `actions/`

Pure synchronous transaction builders. Each action returns a deep-frozen `Transaction<TAction>` and follows the rules in [`packages/morpho-sdk/CLAUDE.md`](../../CLAUDE.md).

## Sub-layers

- `vaultV1/` — VaultV1 (MetaMorpho) `deposit` / `withdraw` / `redeem` / `migrateToV2`.
- `vaultV2/` — VaultV2 `deposit` / `withdraw` / `redeem` / `forceWithdraw` / `forceRedeem`.
- `marketV1/` — Morpho Blue `supplyCollateral` / `borrow` / `supplyCollateralBorrow` / `repay` / `repayWithdrawCollateral` / `withdrawCollateral`. Borrow paths support optional shared liquidity via `reallocations`.
- `requirements/` — token approvals, permit/permit2 signatures, Morpho authorization resolved before deposit/supply.

## Common builder pattern

1. Validate inputs with dedicated errors from `src/types/error.ts` (`assets > 0`, `shares > 0`, `maxSharePrice > 0`, `nativeAmount >= 0`).
2. Encode calldata. **Bundled paths** use `BundlerAction.encodeBundle`; **direct calls** (`vaultV1/withdraw`, `vaultV1/redeem`, `vaultV2/withdraw`, `vaultV2/redeem`, `marketV1/withdrawCollateral`) encode their single function call directly.
3. Call `addTransactionMetadata` only when `metadata` is provided.
4. `deepFreeze` the return value: `{ to, value, data, action: { type, args } }`.

## Native wrapping (canonical statement)

Only valid for assets/collateral configured as wNative. When `nativeAmount > 0`: prepend `nativeTransfer` + `wrapNative` to the bundle and set `tx.value = nativeAmount`. Reject native amounts on non-wNative assets with the dedicated error.

## Shared liquidity / reallocations (canonical statement)

`marketV1Borrow` and `marketV1SupplyCollateralBorrow` accept optional `reallocations: VaultReallocation[]`. Each reallocation becomes a `PublicAllocator.reallocateTo(vault, fee, withdrawals, targetMarket)` bundler action **before** `morphoBorrow`. Fees accumulate in `tx.value`. Validation: `helpers/validateReallocations`. Other layer docs link here rather than restating these rules.

## Discriminated unions

All action interfaces extend `BaseAction<TType, TArgs>` and discriminate on `type`. To add a new operation, see [`types/CLAUDE.md`](../types/CLAUDE.md#adding-a-new-operation).
