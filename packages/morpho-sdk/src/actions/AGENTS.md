# `actions/`

Pure synchronous transaction builders. Each action returns a deep-frozen `Transaction<TAction>` and follows the rules in [`packages/morpho-sdk/AGENTS.md`](../../AGENTS.md).

## Sub-layers

- `vaultV1/` — VaultV1 (MetaMorpho) `deposit` / `withdraw` / `redeem` / `inKindRedeem` / `migrateToV2`.
- `vaultV2/` — VaultV2 `deposit` / `withdraw` / `redeem` / `inKindRedeem` / `forceWithdraw` / `forceRedeem`.
- `blue/` — Morpho Blue `supplyCollateral` / `borrow` / `supplyCollateralBorrow` / `repay` / `repayWithdrawCollateral` / `withdrawCollateral`. Borrow paths support optional shared liquidity via `reallocations`.
- `midnight/` — Midnight fixed-rate direct and bundled transaction encoders plus take normalization for fixed-rate API quote outputs.
- `requirements/` — async resolvers that read on-chain state and return what the user must do/sign before an action: token approvals, permit/permit2 signature requests, Morpho authorization, Midnight authorization, and SetterRatifier root ratification.
- `signatures/` — pure helpers that encode signed requirements for their destination: `getTokenRequirementActions` and `getBlueAuthorizationAction` produce bundler `Action`s, while `getVaultExitBundlesV1PermitStruct` reshapes a vault-share permit for the standalone VaultExitBundlesV1 call.

## Common builder pattern

1. Validate inputs with dedicated errors from `src/types/error.ts` (`assets > 0`, `shares > 0`, `maxSharePrice > 0`, `nativeAmount >= 0`).
2. Encode calldata. **Bundler3 paths** use `BundlerAction.encodeBundle`. **Midnight bundle paths** encode one `MidnightBundles` function call directly. Other **direct calls** (`vaultV1/withdraw`, `vaultV1/redeem`, `vaultV2/withdraw`, `vaultV2/redeem`, `blue/withdrawCollateral`, and Midnight collateral supply, redeem, and offer cancellation) encode their target contract call directly. Vault `inKindRedeem` actions directly encode the standalone `VaultExitBundlesV1` entry point rather than composing a Bundler3 bundle.
3. Call `addTransactionMetadata` only when `metadata` is provided.
4. `deepFreeze` the return value: `{ to, value, data, action: { type, args } }`.

## Native wrapping (canonical statement)

Only valid for assets/collateral configured as wNative. When `nativeAmount > 0`: prepend `nativeTransfer` + `wrapNative` to the bundle; `BundlerAction.encodeBundle` derives `tx.value` from the encoded value-carrying calls. Reject native amounts on non-wNative assets with the dedicated error.

## Shared liquidity / reallocations (canonical statement)

`blueBorrow`, `blueSupplyCollateralBorrow`, loan-asset `blueWithdraw`, and refinance target flows accept optional `reallocations: BlueReallocation[]` (refinance names the field `targetReallocations`). Legacy-untagged or explicitly `publicAllocatorV1` `VaultV1BlueReallocation` entries preserve PublicAllocator V1: each becomes `reallocateTo(vault, fee, sortedWithdrawals, targetMarket)` before the primary Blue action; `VaultReallocation` remains a deprecated alias. Tagged `VaultV2BlueReallocation` entries map 1:1 to `reallocate(...)` for a market source or `allocateFromIdle(...)` for idle liquidity; the enclosing action supplies the target market, the input supplies the allocator/adapters explicitly, and each call passes the vault's configured WAD-scaled `penalty`. A single array may mix PublicAllocator V1 and BluePublicAllocator entries in one Bundler3 transaction. BluePublicAllocator sources are not sorted and idle uses no synthetic zero-address market. High-level builders pull the aggregate V2 penalty in the target loan token through GeneralAdapter1, then each low-level allocator action approves and spends its independently rounded `ceil(assets × penalty / WAD)` amount from Bundler3. Only V1 fees contribute to `tx.value`; all high-level allocator calls use `skipRevert: false`. Validation lives in `helpers/validateReallocations` and rejects unknown top-level or BluePublicAllocator-source discriminators, penalties above WAD, and inconsistent penalties for the same allocator-vault pair.

## Discriminated unions

All action interfaces extend `BaseAction<TType, TArgs>` and discriminate on `type`. To add a new operation, see [`types/AGENTS.md`](../types/AGENTS.md#adding-a-new-operation).
