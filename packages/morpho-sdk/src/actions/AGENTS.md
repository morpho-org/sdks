# `actions/`

Pure synchronous transaction builders. Each action returns a deep-frozen `Transaction<TAction>` and follows the rules in [`packages/morpho-sdk/AGENTS.md`](../../AGENTS.md).

## Sub-layers

- `vaultV1/` — VaultV1 (MetaMorpho) `deposit` / `withdraw` / `redeem` / `inKindRedeem` / `migrateToV2`.
- `vaultV2/` — VaultV2 `deposit` / `withdraw` / `redeem` / `inKindRedeem` / `forceWithdraw` / `forceRedeem`.
- `blue/` — direct BlueBundlesV1 write encoders backing the established `supply`, `withdraw`,
  `supplyCollateral`, `borrow`, `supplyCollateralBorrow`, `repay`, `withdrawCollateral`,
  `repayWithdrawCollateral`, and `refinance` methods on `client.morpho.blue(...)`.
- `midnight/` — Midnight fixed-rate direct and bundled transaction encoders plus take normalization for fixed-rate API quote outputs.
- `requirements/` — async resolvers that read on-chain state and return what the user must do/sign before an action: token approvals, permit/permit2 signature requests, Morpho authorization, Midnight authorization, and SetterRatifier root ratification.
- `signatures/` — pure helpers that reshape signed requirements for their destination.
  `getTokenRequirementActions` and `getBlueAuthorizationAction` support low-level Bundler3
  composition; direct periphery helpers encode BlueBundlesV1 token permits and signed Morpho
  authorization structs, while `getVaultExitBundlesV1PermitStruct` reshapes a vault-share permit
  for VaultExitBundlesV1. The two that must split a signature into a `(v, r, s)` ABI tuple — the
  BlueBundlesV1 permit/authorization encoders and `getVaultExitBundlesV1PermitStruct` — go through
  the `@internal` `normalizeEcdsaSignature(serialized, onInvalid)`, so one place owns the 64-byte
  EIP-2098 / 65-byte parse and the `yParity` → `v` widening while each caller passes the factory for
  its own typed mismatch error. The Bundler3 helpers need none of this: they forward the serialized
  signature verbatim into the bundler action args.

## Common builder pattern

1. Validate inputs with dedicated errors from `src/types/error.ts` (`assets > 0`, `shares > 0`, `maxSharePrice > 0`, `nativeAmount >= 0`).
2. Encode calldata. **Bundler3 paths** use `BundlerAction.encodeBundle`. **Blue write paths** encode
   one registered `BlueBundlesV1` entrypoint directly. **Midnight bundle paths** encode one
   `MidnightBundles` function call directly. Other **direct calls** (vault `withdraw` / `redeem`,
   Midnight collateral supply / redeem / offer cancellation) encode their target contract call
   directly. Vault `inKindRedeem` and `vaultV2/forceWithdraw` actions encode VaultExitBundlesV1
   rather than composing a Bundler3 bundle; `vaultV2/forceRedeem` stays on `VaultV2.multicall`.
3. Call `addTransactionMetadata` only when `metadata` is provided.
4. `deepFreeze` the return value: `{ to, value, data, action: { type, args } }`.

## Native wrapping (canonical statement)

Only valid for assets/collateral configured as wNative. Vault deposit bundles prepend
`nativeTransfer` + `wrapNative`, and `BundlerAction.encodeBundle` derives `tx.value`. Direct
BlueBundlesV1 funding instead sends the native amount as `tx.value`; it is exclusive with an ERC-20
token permit and must equal the funded entrypoint amount. `refinance` moves an existing on-chain
position and takes no native funding. Reject native amounts on non-wNative assets with the dedicated
error.

## Shared liquidity / reallocations (canonical statement)

High-level Blue write reallocations are V2-only. `borrow`, `supplyCollateralBorrow`, `withdraw`,
and `refinance` accept `VaultV2BlueReallocation` entries, which map to BlueBundlesV1
`PublicAllocations` and then to `reallocate(...)` for a market source or `allocateFromIdle(...)` for
idle liquidity. The enclosing action supplies the target market, the input supplies adapters, the
chain registry supplies the allocator, and each call passes the vault's configured WAD-scaled
`penalty` — the allocator donates `ceil(assets × penalty / WAD)` of the target loan token per call.
BluePublicAllocator sources are not sorted and idle uses no synthetic zero-address
market. BlueBundlesV1 executes every allocation unconditionally; aggregate penalties reduce borrow
or withdrawal proceeds, or increase destination debt during migration, and the builder rejects an
aggregate penalty above `borrowAssets` (or, in withdraw assets mode, the withdrawn amount). They do
not add native value or a separate GeneralAdapter1 funding requirement.

PublicAllocator V1 types, data fetchers, simulations, planners, and low-level Bundler3 builders
remain public only for compatibility and advanced composition. All Vault V1 planning and low-level
composition compatibility surfaces are deprecated and will be removed in the next major. Their
`VaultV1Reallocation` outputs are not accepted by the high-level Blue write methods; new write
integrations use `VaultV2BlueReallocation`.

## Discriminated unions

All action interfaces extend `BaseAction<TType, TArgs>` and discriminate on `type`. To add a new operation, see [`types/AGENTS.md`](../types/AGENTS.md#adding-a-new-operation).
