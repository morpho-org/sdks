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
2. Encode calldata. **Bundler3 paths** (vault deposits) use `BundlerAction.encodeBundle`. **Midnight bundle paths** encode one `MidnightBundles` function call directly. **Direct BlueBundlesV1 calls** — every high-level Blue write (`supply`, `supplyCollateral`, `borrow`, `supplyCollateralBorrow`, `repay`, `withdrawCollateral`, `repayWithdrawCollateral`, `withdraw`, `refinance`) — encode a single `BlueBundlesV1` function call. Other **direct calls** (`vaultV1/withdraw`, `vaultV1/redeem`, `vaultV2/withdraw`, `vaultV2/redeem`, and Midnight collateral supply, redeem, and offer cancellation) encode their target contract call directly. Vault `inKindRedeem` actions directly encode the standalone `VaultExitBundlesV1` entry point rather than composing a Bundler3 bundle.
3. Call `addTransactionMetadata` only when `metadata` is provided.
4. `deepFreeze` the return value: `{ to, value, data, action: { type, args } }`.

## Native wrapping (canonical statement)

Only valid for assets/collateral configured as wNative; reject native amounts on non-wNative assets with the dedicated error. On **Bundler3 paths** (vault deposits), `nativeAmount > 0` prepends `nativeTransfer` + `wrapNative` and `BundlerAction.encodeBundle` derives `tx.value` from the encoded value-carrying calls. On **direct BlueBundlesV1 paths** (loan-asset `supply`, collateral supply, `repay`, `repayWithdrawCollateral`), the native amount is attached directly as `tx.value` on the single payable call, which the contract wraps. `refinance` moves the existing on-chain position and takes no native funding.

## Shared liquidity / reallocations (canonical statement)

`blueBorrow`, `blueSupplyCollateralBorrow`, loan-asset `blueWithdraw`, and `refinance` accept only
`VaultV2BlueReallocation` inputs (each names the field `reallocations`). Each
entry maps 1:1 to `reallocate(...)` for a market source or `allocateFromIdle(...)` for idle
liquidity; the enclosing action supplies the target market, the input supplies adapters, the chain
registry supplies the allocator, and each call passes the vault's configured WAD-scaled `penalty`.
BluePublicAllocator sources are not sorted and idle uses no synthetic zero-address market.

`blueBorrow`, `blueSupplyCollateralBorrow`, loan-asset `blueWithdraw`, and `refinance` carry the
reallocations array inside their single `BlueBundlesV1` call (`blueBundlesV1SupplyCollateralAndBorrow`,
`blueBundlesV1Withdraw`, `blueBundlesV1MigrateBorrowPosition`) and let the contract apply each
`ceil(assets × penalty / WAD)` penalty — netted from the borrow or withdrawn proceeds, or added to
the migrated destination debt for `refinance` — so they emit no separate Bundler3 penalty-funding
action, and the builder rejects an aggregate penalty that would exceed the borrowed amount (or, in
withdraw assets mode, the withdrawn amount). Vault V1 planners and encoders remain available for explicit low-level
Bundler3 composition, but those Vault V1 compatibility surfaces are deprecated and will be removed in
the next major.

## Discriminated unions

All action interfaces extend `BaseAction<TType, TArgs>` and discriminate on `type`. To add a new operation, see [`types/AGENTS.md`](../types/AGENTS.md#adding-a-new-operation).
