# `actions/`

Pure synchronous transaction builders. Each action returns a deep-frozen `Transaction<TAction>` and follows the rules in [`packages/morpho-sdk/AGENTS.md`](../../AGENTS.md).

## Sub-layers

- `vaultV1/` — VaultV1 (MetaMorpho) `deposit` / `withdraw` / `redeem` / `migrateToV2`.
- `vaultV2/` — VaultV2 `deposit` / `withdraw` / `redeem` / `forceWithdraw` / `forceRedeem`.
- `blue/` — Morpho Blue `supplyCollateral` / `borrow` / `supplyCollateralBorrow` / `repay` / `repayWithdrawCollateral` / `withdrawCollateral`. Borrow paths support optional shared liquidity via `reallocations`.
- `midnight/` — Midnight fixed-rate direct and bundled transaction encoders plus take normalization for fixed-rate API quote outputs.
- `requirements/` — async resolvers that read on-chain state and return what the user must do/sign before an action: token approvals, permit/permit2 signature requests, Morpho authorization, Midnight authorization, and SetterRatifier root ratification.
- `signatures/` — pure encoders that turn signed requirements into the bundler `Action`s prepended to a bundle (`getTokenRequirementActions` for token permit / permit2 transfers, `getBlueAuthorizationAction` for `setAuthorizationWithSig`).

## Common builder pattern

1. Validate inputs with dedicated errors from `src/types/error.ts` (`assets > 0`, `shares > 0`, `maxSharePrice > 0`, `nativeAmount >= 0`).
2. Encode calldata. **Bundler3 paths** use `BundlerAction.encodeBundle`. **Midnight bundle paths** encode one `MidnightBundles` function call directly. Other **direct calls** (`vaultV1/withdraw`, `vaultV1/redeem`, `vaultV2/withdraw`, `vaultV2/redeem`, `blue/withdrawCollateral`, and Midnight collateral supply, redeem, and offer cancellation) encode their target contract call directly.
3. Call `addTransactionMetadata` only when `metadata` is provided.
4. `deepFreeze` the return value: `{ to, value, data, action: { type, args } }`.

## Native wrapping (canonical statement)

Only valid for assets/collateral configured as wNative. When `nativeAmount > 0`: prepend `nativeTransfer` + `wrapNative` to the bundle; `BundlerAction.encodeBundle` derives `tx.value` from the encoded value-carrying calls. Reject native amounts on non-wNative assets with the dedicated error.

## Shared liquidity / reallocations (canonical statement)

`blueBorrow`, `blueSupplyCollateralBorrow`, loan-asset `blueWithdraw`, and refinance target flows accept optional `reallocations: BlueReallocation[]` (refinance names the field `targetReallocations`). Legacy-untagged or explicitly `publicAllocatorV1` `VaultReallocation` entries preserve PublicAllocator V1: each becomes `reallocateTo(vault, fee, sortedWithdrawals, targetMarket)` before the primary Blue action. Tagged `BluePublicAllocatorReallocation` entries map 1:1 to `reallocate(...)` for a market source or `allocateFromIdle(...)` for idle liquidity; the enclosing action supplies the target market, the input supplies the allocator/adapters explicitly, and each call pays its own `nativePenalty`. A single array may mix PublicAllocator V1 and BluePublicAllocator entries in one Bundler3 transaction. BluePublicAllocator sources are not sorted and idle uses no synthetic zero-address market. `BundlerAction.encodeBundle` sums V1 fees and BluePublicAllocator penalties into `tx.value`; all high-level allocator calls use `skipRevert: false`. Validation lives in `helpers/validateReallocations` and rejects unknown top-level or BluePublicAllocator-source discriminators.

## Discriminated unions

All action interfaces extend `BaseAction<TType, TArgs>` and discriminate on `type`. To add a new operation, see [`types/AGENTS.md`](../types/AGENTS.md#adding-a-new-operation).
