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
2. Encode calldata. **Bundler3 paths** use `BundlerAction.encodeBundle`. **Midnight bundle paths** encode one `MidnightBundles` function call directly. Other **direct calls** (`vaultV1/redeem`, `vaultV2/redeem`, `blue/withdrawCollateral`, and Midnight collateral supply, redeem, and offer cancellation) encode their target contract call directly. `vaultV1/withdraw` and `vaultV2/withdraw` encode one VaultBundlesV1 call instead of a vault call; they carry an optional embedded shares permit and require the exact share allowance resolved by the entity's `getRequirements()`. Vault `inKindRedeem` actions directly encode the standalone `VaultExitBundlesV1` entry point rather than composing a Bundler3 bundle.
3. Call `addTransactionMetadata` only when `metadata` is provided.
4. `deepFreeze` the return value: `{ to, value, data, action: { type, args } }`.

## Native funding (canonical statement)

Native funding is valid only for assets/collateral configured as wNative; reject it on any other
asset with the dedicated error. On **Bundler3 paths**, `nativeAmount > 0` prepends
`nativeTransfer` + `wrapNative`, and `BundlerAction.encodeBundle` derives `tx.value` from those
value-carrying calls. On direct **VaultBundlesV1 vault deposits**, encode the gross native amount as
the deposit assets and send that same amount as `tx.value` to `vaultBundlesV1Deposit`; the
standalone contract wraps the value internally, so these paths do not add Bundler3 actions or a
token permit.

## Shared liquidity / reallocations (canonical statement)

`blueBorrow`, `blueSupplyCollateralBorrow`, loan-asset `blueWithdraw`, and refinance target flows
accept only `VaultV2BlueReallocation` inputs (refinance names the field `targetReallocations`). Each
entry maps 1:1 to `reallocate(...)` for a market source or `allocateFromIdle(...)` for idle
liquidity; the enclosing action supplies the target market, the input supplies adapters, the chain
registry supplies the allocator, and each call passes the vault's configured WAD-scaled `penalty`.
BluePublicAllocator sources are not sorted and idle uses no synthetic zero-address market.
High-level builders pull the aggregate penalty in the target loan token through GeneralAdapter1,
then each low-level allocator action approves and spends its independently rounded
`ceil(assets × penalty / WAD)` amount from Bundler3. All high-level allocator calls use
`skipRevert: false`. Vault V1 planners and encoders remain available for explicit low-level
Bundler3 composition, but those Vault V1 compatibility surfaces are deprecated and will be removed
in the next major.

## Discriminated unions

All action interfaces extend `BaseAction<TType, TArgs>` and discriminate on `type`. To add a new operation, see [`types/AGENTS.md`](../types/AGENTS.md#adding-a-new-operation).
