# @morpho-org/blue-sdk-viem

## 6.0.0

### Major Changes

- [#1015](https://github.com/morpho-org/sdks/pull/1015) [`0e72b04`](https://github.com/morpho-org/sdks/commit/0e72b0439aa46c7a7d6b4e6fad6d2d9c79c2e45e) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Remove all deprecated public symbols from the next majors of morpho-sdk, morpho-ts, blue-sdk,
  blue-sdk-viem, and WDK. This includes Vault V1 PublicAllocator addresses, ABIs, models, fetchers,
  augmentation, planners, action inputs, and compatibility aliases; deprecated utility, URL, permit,
  deployless-fetch, capacity, adapter-id, error, signature, and facade aliases; and the deprecated WDK
  requirement type. Use Vault V2 BluePublicAllocator APIs and each symbol's canonical replacement.

  Remove morpho-sdk's low-level Bundler3 composition surface and the residual Bundler3 executor,
  adapter, migration-adapter, address, deployment, action, requirement, ABI, and error exports from
  morpho-sdk and morpho-ts, including the registry and ABI re-exports in blue-sdk and blue-sdk-viem.
  This completes removal of the old migration-sdk-viem implementation, including its Aave and
  Compound migration adapters. Remove the legacy MORPHO token/wrapper addresses and wrapper ABI
  entries. The standalone BlueBundlesV1, VaultBundlesV1, and VaultExitBundlesV1 routes remain
  supported. evm-simulation now checks retention only on those standalone bundle contracts; legacy
  Bundler3 and adapter addresses are no longer guarded.

  Remove Bundler3-specific Blue state too: `Holding` no longer exposes the GeneralAdapter ERC-20 or
  Permit2 allowance, and `User` no longer exposes `isBundlerAuthorized`; their viem fetchers stop
  reading those contracts. These fields and the low-level Bundler3 surfaces were stable APIs without
  a published deprecation.

  Some removals did not receive a published deprecation window: the stable low-level Bundler3 and
  migration-adapter surfaces (including registry and ABI re-exports), compatibility errors, signature
  helpers, types, and the WDK requirement alias first deprecated only during the v6 prerelease, and the
  five v5 partial-refinance error classes. This is an intentional one-time lifecycle deviation;
  consumers must migrate to the standalone bundle actions and canonical exports or stay on the
  previous major versions. The deviation and its symbol scope are recorded in
  `docs/tibs/TIB-2026-09-17-remove-bundler3-primitives-without-deprecation.md` and the matching
  AGENTS.md release exception.

  Keep liquidity-sdk-viem on its final Vault V1 PublicAllocator release, tested against morpho-sdk
  v5.9.0. Patch maintained dependents and update internal peer ranges for the new morpho-ts, blue-sdk,
  and blue-sdk-viem majors.

  Add `UnsupportedRequirementSignatureError`, thrown by `selectRequirementSignatures` and
  `getBundlesTokenPermit` when a requirement signature carries an action type the v6 flows do not
  support (e.g. a stale v5 `permit2` signature). `getBundlesTokenPermit` previously threw
  `UnexpectedRequirementSignatureError("permit")` for that case.

### Minor Changes

- [#1132](https://github.com/morpho-org/sdks/pull/1132) [`a8167e7`](https://github.com/morpho-org/sdks/commit/a8167e7505cc6ca1baa789e239e0f944d5a6e47c) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Deprecate all pre-liquidation logic. Every pre-liquidation export is now marked `@deprecated` and will be removed in the next major; there is no successor.

  - `blue-sdk`: `PreLiquidationParams`, `IPreLiquidationParams`, `PreLiquidationPosition`, `IPreLiquidationPosition`, `defaultPreLiquidationParamsRegistry`, `getDefaultPreLiquidationParams`, and `UnsupportedPreLiquidationParamsError`.
  - `blue-sdk-viem`: `fetchPreLiquidationParams`, `fetchPreLiquidationPosition`, `AccrualPosition.fetchPreLiquidation`, `preLiquidationAbi`, and `preLiquidationFactoryAbi`.
  - `morpho-sdk`: the matching `/blue/*` raw re-exports and the `Blue`-qualified facade aliases (`BluePreLiquidationParams`, `IBluePreLiquidationParams`, `BluePreLiquidationPosition`, `IBluePreLiquidationPosition`, `fetchBluePreLiquidationParams`, `fetchBluePreLiquidationPosition`, `UnsupportedBluePreLiquidationParamsError`, `bluePreLiquidationAbi`, `bluePreLiquidationFactoryAbi`, `blueDefaultPreLiquidationParamsRegistry`, `getBlueDefaultPreLiquidationParams`, and `BlueAccrualPosition.fetchPreLiquidation`).
  - `morpho-ts`: the `preLiquidationFactory` chain-address field.

  Runtime behavior is unchanged; this only adds `@deprecated` JSDoc.

- [#1125](https://github.com/morpho-org/sdks/pull/1125) [`a953009`](https://github.com/morpho-org/sdks/commit/a953009d2821bfcc036b391439e9180408852cec) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - `safeParseUnits` now validates the whole input against an anchored decimal grammar (`/^[-+]?(\d+\.?\d*|\.\d+)$/`) before parsing, so malformed strings such as `"100.00.999"`, `"1e5"`, or `"abc1"` throw `InvalidNumberError` (exported from `@morpho-org/blue-sdk-viem` and the `morpho-sdk` errors facades) instead of being silently truncated to a different amount. Sign handling is normalized before calling `parseUnits`, and fractional truncation to `decimals` is unchanged.

### Patch Changes

- [#1125](https://github.com/morpho-org/sdks/pull/1125) [`8cdfa51`](https://github.com/morpho-org/sdks/commit/8cdfa51ceee5b08314aec136072d2202a8be35a8) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Expose the documented augmentation subpaths: `package.json` now exports `./augment` and `./augment/*` (dev exports map to `src/augment`, `publishConfig.exports` and `publishConfig.typesVersions` to `lib/{esm,cjs}/augment`), so `import "@morpho-org/blue-sdk-viem/augment/Market"` and friends resolve instead of throwing `ERR_PACKAGE_PATH_NOT_EXPORTED`. The `sideEffects` manifest field now protects the augmentation modules from tree-shaking, and the README uses the new subpaths (dropping the non-existent `augment/AccrualPosition` entry — `augment/Position` augments `Position` and `AccrualPosition` — and adding the missing `augment/User`).

  Refs SDK-1100

- [#1120](https://github.com/morpho-org/sdks/pull/1120) [`c9c8fbd`](https://github.com/morpho-org/sdks/commit/c9c8fbdcb4683e902a2c484efb52e1f58cb2cfcc) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - `fetchMarket` and `fetchAccrualVaultV2` now detect the Adaptive Curve IRM case-insensitively, so `rateAtTarget` is populated on deployments whose registry entry is not checksummed.

  `MidnightApi.fetchBook` / `fetchBooks` now return `collaterals` in the protocol's canonical order, so the array index matches the onchain `collateralIndex` used by Midnight actions.

- [#911](https://github.com/morpho-org/sdks/pull/911) [`468422d`](https://github.com/morpho-org/sdks/commit/468422d90019029b3d18ac239bf6fbb19748c22e) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Forward `AccrualVaultV2.accrueInterest` now also accrues contributing nested adapters, markets, and positions, using an optional backward-compatible `accrueInterest(timestamp)` method on `IAccrualVaultV2Adapter` implemented by built-in adapters. Adapters without it, zero-share or zero-allocation nested state, and markets already ahead of the timestamp keep their snapshots. Vault-level totals and fee shares are computed exactly as before.

  Accrual at or before the vault's `lastUpdate` returns an unchanged copy without touching nested adapters.

- Updated dependencies [[`800f2e1`](https://github.com/morpho-org/sdks/commit/800f2e1f0523de39fe9055b2f077ebf5f72e5d57), [`a8167e7`](https://github.com/morpho-org/sdks/commit/a8167e7505cc6ca1baa789e239e0f944d5a6e47c), [`0e72b04`](https://github.com/morpho-org/sdks/commit/0e72b0439aa46c7a7d6b4e6fad6d2d9c79c2e45e), [`468422d`](https://github.com/morpho-org/sdks/commit/468422d90019029b3d18ac239bf6fbb19748c22e)]:
  - @morpho-org/morpho-ts@3.0.0
  - @morpho-org/blue-sdk@7.0.0

## 6.0.0-next.1

### Minor Changes

- [#1132](https://github.com/morpho-org/sdks/pull/1132) [`a8167e7`](https://github.com/morpho-org/sdks/commit/a8167e7505cc6ca1baa789e239e0f944d5a6e47c) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Deprecate all pre-liquidation logic. Every pre-liquidation export is now marked `@deprecated` and will be removed in the next major; there is no successor.

  - `blue-sdk`: `PreLiquidationParams`, `IPreLiquidationParams`, `PreLiquidationPosition`, `IPreLiquidationPosition`, `defaultPreLiquidationParamsRegistry`, `getDefaultPreLiquidationParams`, and `UnsupportedPreLiquidationParamsError`.
  - `blue-sdk-viem`: `fetchPreLiquidationParams`, `fetchPreLiquidationPosition`, `AccrualPosition.fetchPreLiquidation`, `preLiquidationAbi`, and `preLiquidationFactoryAbi`.
  - `morpho-sdk`: the matching `/blue/*` raw re-exports and the `Blue`-qualified facade aliases (`BluePreLiquidationParams`, `IBluePreLiquidationParams`, `BluePreLiquidationPosition`, `IBluePreLiquidationPosition`, `fetchBluePreLiquidationParams`, `fetchBluePreLiquidationPosition`, `UnsupportedBluePreLiquidationParamsError`, `bluePreLiquidationAbi`, `bluePreLiquidationFactoryAbi`, `blueDefaultPreLiquidationParamsRegistry`, `getBlueDefaultPreLiquidationParams`, and `BlueAccrualPosition.fetchPreLiquidation`).
  - `morpho-ts`: the `preLiquidationFactory` chain-address field.

  Runtime behavior is unchanged; this only adds `@deprecated` JSDoc.

- [#1125](https://github.com/morpho-org/sdks/pull/1125) [`a953009`](https://github.com/morpho-org/sdks/commit/a953009d2821bfcc036b391439e9180408852cec) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - `safeParseUnits` now validates the whole input against an anchored decimal grammar (`/^[-+]?(\d+\.?\d*|\.\d+)$/`) before parsing, so malformed strings such as `"100.00.999"`, `"1e5"`, or `"abc1"` throw `InvalidNumberError` (exported from `@morpho-org/blue-sdk-viem` and the `morpho-sdk` errors facades) instead of being silently truncated to a different amount. Sign handling is normalized before calling `parseUnits`, and fractional truncation to `decimals` is unchanged.

### Patch Changes

- [#1125](https://github.com/morpho-org/sdks/pull/1125) [`8cdfa51`](https://github.com/morpho-org/sdks/commit/8cdfa51ceee5b08314aec136072d2202a8be35a8) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Expose the documented augmentation subpaths: `package.json` now exports `./augment` and `./augment/*` (dev exports map to `src/augment`, `publishConfig.exports` and `publishConfig.typesVersions` to `lib/{esm,cjs}/augment`), so `import "@morpho-org/blue-sdk-viem/augment/Market"` and friends resolve instead of throwing `ERR_PACKAGE_PATH_NOT_EXPORTED`. The `sideEffects` manifest field now protects the augmentation modules from tree-shaking, and the README uses the new subpaths (dropping the non-existent `augment/AccrualPosition` entry — `augment/Position` augments `Position` and `AccrualPosition` — and adding the missing `augment/User`).

  Refs SDK-1100

- [#1120](https://github.com/morpho-org/sdks/pull/1120) [`c9c8fbd`](https://github.com/morpho-org/sdks/commit/c9c8fbdcb4683e902a2c484efb52e1f58cb2cfcc) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - `fetchMarket` and `fetchAccrualVaultV2` now detect the Adaptive Curve IRM case-insensitively, so `rateAtTarget` is populated on deployments whose registry entry is not checksummed.

  `MidnightApi.fetchBook` / `fetchBooks` now return `collaterals` in the protocol's canonical order, so the array index matches the onchain `collateralIndex` used by Midnight actions.

- [#911](https://github.com/morpho-org/sdks/pull/911) [`468422d`](https://github.com/morpho-org/sdks/commit/468422d90019029b3d18ac239bf6fbb19748c22e) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Forward `AccrualVaultV2.accrueInterest` now also accrues contributing nested adapters, markets, and positions, using an optional backward-compatible `accrueInterest(timestamp)` method on `IAccrualVaultV2Adapter` implemented by built-in adapters. Adapters without it, zero-share or zero-allocation nested state, and markets already ahead of the timestamp keep their snapshots. Vault-level totals and fee shares are computed exactly as before.

  Accrual at or before the vault's `lastUpdate` returns an unchanged copy without touching nested adapters.

- Updated dependencies [[`800f2e1`](https://github.com/morpho-org/sdks/commit/800f2e1f0523de39fe9055b2f077ebf5f72e5d57), [`a8167e7`](https://github.com/morpho-org/sdks/commit/a8167e7505cc6ca1baa789e239e0f944d5a6e47c), [`468422d`](https://github.com/morpho-org/sdks/commit/468422d90019029b3d18ac239bf6fbb19748c22e)]:
  - @morpho-org/morpho-ts@3.0.0-next.1
  - @morpho-org/blue-sdk@7.0.0-next.2

## 6.0.0-next.0

### Major Changes

- [#1015](https://github.com/morpho-org/sdks/pull/1015) [`0e72b04`](https://github.com/morpho-org/sdks/commit/0e72b0439aa46c7a7d6b4e6fad6d2d9c79c2e45e) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Remove all deprecated public symbols from the next majors of morpho-sdk, morpho-ts, blue-sdk,
  blue-sdk-viem, and WDK. This includes Vault V1 PublicAllocator addresses, ABIs, models, fetchers,
  augmentation, planners, action inputs, and compatibility aliases; deprecated utility, URL, permit,
  deployless-fetch, capacity, adapter-id, error, signature, and facade aliases; and the deprecated WDK
  requirement type. Use Vault V2 BluePublicAllocator APIs and each symbol's canonical replacement.

  Remove morpho-sdk's low-level Bundler3 composition surface and the residual Bundler3 executor,
  adapter, migration-adapter, address, deployment, action, requirement, ABI, and error exports from
  morpho-sdk and morpho-ts, including the registry and ABI re-exports in blue-sdk and blue-sdk-viem.
  This completes removal of the old migration-sdk-viem implementation, including its Aave and
  Compound migration adapters. Remove the legacy MORPHO token/wrapper addresses and wrapper ABI
  entries. The standalone BlueBundlesV1, VaultBundlesV1, and VaultExitBundlesV1 routes remain
  supported. evm-simulation now checks retention only on those standalone bundle contracts; legacy
  Bundler3 and adapter addresses are no longer guarded.

  Remove Bundler3-specific Blue state too: `Holding` no longer exposes the GeneralAdapter ERC-20 or
  Permit2 allowance, and `User` no longer exposes `isBundlerAuthorized`; their viem fetchers stop
  reading those contracts. These fields and the low-level Bundler3 surfaces were stable APIs without
  a published deprecation.

  Some removals did not receive a published deprecation window: the stable low-level Bundler3 and
  migration-adapter surfaces (including registry and ABI re-exports), compatibility errors, signature
  helpers, types, and the WDK requirement alias first deprecated only during the v6 prerelease, and the
  five v5 partial-refinance error classes. This is an intentional one-time lifecycle deviation;
  consumers must migrate to the standalone bundle actions and canonical exports or stay on the
  previous major versions. The deviation and its symbol scope are recorded in
  `docs/tibs/TIB-2026-09-17-remove-bundler3-primitives-without-deprecation.md` and the matching
  AGENTS.md release exception.

  Keep liquidity-sdk-viem on its final Vault V1 PublicAllocator release, tested against morpho-sdk
  v5.9.0. Patch maintained dependents and update internal peer ranges for the new morpho-ts, blue-sdk,
  and blue-sdk-viem majors.

  Add `UnsupportedRequirementSignatureError`, thrown by `selectRequirementSignatures` and
  `getBundlesTokenPermit` when a requirement signature carries an action type the v6 flows do not
  support (e.g. a stale v5 `permit2` signature). `getBundlesTokenPermit` previously threw
  `UnexpectedRequirementSignatureError("permit")` for that case.

### Patch Changes

- Updated dependencies [[`0e72b04`](https://github.com/morpho-org/sdks/commit/0e72b0439aa46c7a7d6b4e6fad6d2d9c79c2e45e)]:
  - @morpho-org/morpho-ts@3.0.0-next.0
  - @morpho-org/blue-sdk@7.0.0-next.1

## 5.5.1-next.0

### Patch Changes

- [#1056](https://github.com/morpho-org/sdks/pull/1056) [`c4b4467`](https://github.com/morpho-org/sdks/commit/c4b44677e7a6881072eca0fe5eba54c3d9761b60) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Stop mutating caller-owned fetch `parameters` objects: every fetcher now defaults `chainId`/`deployless` on its own copy, so a shared options object reused across clients or chains is no longer silently pinned to the first resolved chain id.

## 5.7.0

### Minor Changes

- [#1080](https://github.com/morpho-org/sdks/pull/1080) [`616b457`](https://github.com/morpho-org/sdks/commit/616b4578edd3509ff3cf4e666f958f16e3bcdcab) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Deprecate all Vault V1 PublicAllocator surfaces, including raw ABIs, address and deployment registry fields, configuration models, fetchers, augmentation methods, and the liquidity loader. The existing V1 planning and transaction-composition deprecations continue to apply. Use Vault V2 BluePublicAllocator configurations and fetchers, `MorphoBlue.getVaultV2BlueReallocationData`, and `MorphoBlue.getVaultV2BlueReallocations` for new integrations.

  Deprecate the legacy `morphoToken` address and the MORPHO legacy wrapping entries in `ethereumGeneralAdapter1Abi`. Use the current MORPHO token directly.

  All deprecated exports, signatures, addresses, and transaction behavior remain available for compatibility until the next major release. General Vault V1 operations, Vault V2 allocator APIs, and other token wrapping flows remain supported.

  Patch maintained runtime dependents so their next releases resolve the updated packages. Existing internal peer ranges accept these backward-compatible minor releases and require no changes.

### Patch Changes

- Updated dependencies [[`616b457`](https://github.com/morpho-org/sdks/commit/616b4578edd3509ff3cf4e666f958f16e3bcdcab), [`297e948`](https://github.com/morpho-org/sdks/commit/297e94823b86359d4bbeda2d70dd79abac0c1a8a)]:
  - @morpho-org/blue-sdk@6.9.0
  - @morpho-org/morpho-ts@2.13.0

## 5.6.1

### Patch Changes

- [#1045](https://github.com/morpho-org/sdks/pull/1045) [`c6756ed`](https://github.com/morpho-org/sdks/commit/c6756eddc5c4f9b60f966e5ab2eb0403000a6874) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Deployless `fetchVault` now reports `publicAllocatorConfig` as `undefined` when the vault has not enabled the chain's PublicAllocator as an allocator, matching the multicall path. Previously the deployless path returned a zeroed `{ admin, fee, accruedFee }` config whenever the chain had a PublicAllocator, which made Vault V1 shared-liquidity planning treat the vault as reallocatable. The generated `GetVault` query ABI gains a `hasPublicAllocator` flag.

- Updated dependencies [[`ebaba84`](https://github.com/morpho-org/sdks/commit/ebaba84e28832c2d1935c9f21ab3b37d037b18dd)]:
  - @morpho-org/morpho-ts@2.12.0

## 5.6.0

### Minor Changes

- [#1027](https://github.com/morpho-org/sdks/pull/1027) [`6ad775f`](https://github.com/morpho-org/sdks/commit/6ad775fc794b1b164fef5defaf10f2d32a889fd1) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Preserve immutable Blue collateral projections and direct onchain Vault V1 fetch results, project Vault V1 market, loss, and fee accounting when computing migration bounds, deprecate cached collateral-allocation proportions and the positional nested-vault parent-allocation constructor argument, and ignore residual nested-vault shares when their parent allocation is zero.

### Patch Changes

- [#1042](https://github.com/morpho-org/sdks/pull/1042) [`5e09aa2`](https://github.com/morpho-org/sdks/commit/5e09aa2c2bb091c9ace4a5bda200e2ca520227b2) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Compare token addresses case-insensitively: `getUnwrappedToken` resolves lowercased wrapped-token addresses against the checksummed registry (and re-registering the same mapping under a different casing no longer creates a duplicate key), while `fetchHolding`/`fetchToken` now detect permissioned Backed/wrapper tokens, wstETH, and the native token regardless of the caller's address casing.

- [#1041](https://github.com/morpho-org/sdks/pull/1041) [`b26a427`](https://github.com/morpho-org/sdks/commit/b26a427ea98c314e0fec761e6ffec7f439f35891) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Stop mutating caller-owned fetch `parameters` objects: every fetcher now defaults `chainId`/`deployless` on its own copy, so a shared options object reused across clients or chains is no longer silently pinned to the first resolved chain id.

- Updated dependencies [[`5e09aa2`](https://github.com/morpho-org/sdks/commit/5e09aa2c2bb091c9ace4a5bda200e2ca520227b2), [`0a3e9a3`](https://github.com/morpho-org/sdks/commit/0a3e9a32b184164ed774d6aae35868987e622597), [`6ad775f`](https://github.com/morpho-org/sdks/commit/6ad775fc794b1b164fef5defaf10f2d32a889fd1)]:
  - @morpho-org/morpho-ts@2.11.2
  - @morpho-org/blue-sdk@6.8.0

## 5.5.0

### Minor Changes

- [#1007](https://github.com/morpho-org/sdks/pull/1007) [`55d0ade`](https://github.com/morpho-org/sdks/commit/55d0ade66c7e48aeae478f40df3d2bf2e9b61c0e) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Deprecate `getDaiPermitTypedData` and `DaiPermitArgs`. The SDK routes DAI approvals through Permit2 / classic approval internally — DAI's non-standard boolean permit (any positive `allowance` authorizes `type(uint256).max`, not the passed amount) is incompatible with the ERC-2612 simple-permit path — so this standalone helper is unused by every SDK flow. It stays exported for one more minor and will be removed in the next major; prefer the Permit2 flow. The `morpho-sdk` facade re-exports (`utils`, `/blue/utils`, `/blue/types`) carry the same `@deprecated` annotation.

### Patch Changes

- [#985](https://github.com/morpho-org/sdks/pull/985) [`94dbd38`](https://github.com/morpho-org/sdks/commit/94dbd387337f31a522f339958881d0c5d2326af2) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Clamp Permit2 SignatureTransfer allowances to the full uint256 range instead of the uint160
  AllowanceTransfer limit.
- Updated dependencies [[`2601458`](https://github.com/morpho-org/sdks/commit/26014581bf7470bc090c4837bd9ed3cf6fc8f31b)]:
  - @morpho-org/morpho-ts@2.11.1

## 5.4.0

### Minor Changes

- [#949](https://github.com/morpho-org/sdks/pull/949) [`67399ed`](https://github.com/morpho-org/sdks/commit/67399ed6eb1b7ffa062828e1f5d970795adce03a) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Expose Vault V2 allocator entities, fetchers, and utilities, plus omitted in-kind redemption and Midnight surfaces. Add raw Blue and Midnight protocol subpaths, qualify protocol-specific exports in the shared facades, and expose the error identities, revert classifiers, permit builders, MetaMorpho encoders, allowance metadata, and PreLiquidation defaults required by those surfaces. Deprecate ambiguous protocol-specific names, Blue's custom fetch `chainId` override, and the redundant deployless-only Vault V2 fetcher.

## 5.3.0

### Minor Changes

- [#919](https://github.com/morpho-org/sdks/pull/919) [`402175b`](https://github.com/morpho-org/sdks/commit/402175b32cc37e0da9e7b33495080a695941fa71) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Add canonical `vaultV1PublicAllocatorAbi` and `vaultV2BluePublicAllocatorAbi` exports plus per-chain `vaultV1PublicAllocator` and `vaultV2BluePublicAllocator` registry entries to `morpho-ts`, preserving `publicAllocatorAbi` and `publicAllocator` as deprecated V1 aliases. Move the shared `marketParamsAbi` source of truth to its `abis/marketParams` leaf export while preserving the aggregate `abis` and `blue-sdk` re-exports, and raise the `blue-sdk` peer range to the introducing `morpho-ts` minor. Add Vault V2 allocation-cap helpers and the updated `canPullFromIdle`/`canPullFromMarket`/WAD-scaled penalty config types to `blue-sdk`, accept iterable active-adapter, vault-allowlist, and reallocation-plan inputs while materializing them before repeated use, add chain-registry-backed deployless and fallback reads to `blue-sdk-viem`, and expose Vault V2 shared-liquidity discovery, planning, metrics, maximum-penalty filtering, and flat market/idle reallocations through `morpho-sdk` Blue flows.

  V2 bundles now reject chains without a registered BluePublicAllocator before exposing requirements, pull the proportional loan-token penalty through GeneralAdapter1, grant the allocator an exact non-skippable allowance from Bundler3 after first resetting it to zero, pass the configured `uint64 penalty` in calldata, and keep the nonpayable allocator calls out of `tx.value`. `VaultV2BluePublicAllocatorConfig` is hydrated as a class with exact per-call penalty calculation, `VaultV2BlueMarketPublicAllocatorConfig` computes max-in capacity from its absolute cap, and plan totals stay local to their consumers. The planner mirrors contract execution order for penalties, source deallocation, first vault accrual (including zero-elapsed loss recognition), and target allocation; freezes the resulting relative-cap denominator across later calls for that vault; separates shared-ID validation from non-shared upper-bound search, may exceed an operation's preferred ceiling when a penalty donation imposes a higher shared-cap lower bound, and conservatively omits max-failing shared-cap candidates instead of scanning non-monotonic base-unit amounts; keeps every adapter coherent with one canonical simulated state per Morpho market; preserves supplied address casing while matching vaults and adapters case-insensitively; rejects incomplete allocator snapshots instead of silently reporting no liquidity; rejects non-positive operation amounts and same-market moves across adapters; and uses the latest timestamp in its complete input snapshot by default.

  Use coherent protocol-specific names across the V1 and V2 reallocation APIs, including `VaultV1ReallocationData`, `VaultV2BlueReallocationData`, `computeVaultV1Reallocations`, `VaultV2BluePublicAllocatorOptions`, `VaultV2BluePublicAllocatorConfig`, its fetcher family, and Vault V2-prefixed Bundler actions. Add `MorphoBlue.getVaultV1ReallocationData`, `getVaultV1Reallocations`, `getVaultV2BlueReallocationData`, and `getVaultV2BlueReallocations`; preserve the published unversioned `getReallocationData` and `getReallocations` as deprecated V1 aliases. Both versioned planners reject reallocation snapshots from another chain. Keep V1's `defaultMaxWithdrawalUtilization` configurable, and add V2's scalar `maxWithdrawalUtilization` for its friendly phase while retaining the 100% adversarial fallback.

  Compatibility note: this minor intentionally accepts four breaking changes. `VaultV2MorphoMarketV1Adapter.ids()` and `VaultV2MorphoMarketV1AdapterV2.ids()` now return the labeled readonly tuple `readonly [adapterCapId: Hash, collateralCapId: Hash, adapterMarketCapId: Hash]` instead of mutable `Hash[]`, while `VaultV2MorphoVaultV1Adapter.ids()` now returns `readonly [adapterCapId: Hash]`; `MorphoBlue.withdraw`, `borrow`, and `refinance` may now return `Transaction<ERC20ApprovalAction>` from `getRequirements()` for Vault V2 penalty funding; `BlueWithdrawAction`, `BlueBorrowAction`, `BlueSupplyCollateralBorrowAction`, and `BlueRefinanceAction` now require `reallocationPenaltyAssets`; and Vault V2 reallocation discovery now accepts only zero-penalty vaults by default. Runtime ordering for `ids()` is unchanged. Consumers should spread `ids()` when a mutable array is required, handle approval transactions in exhaustive requirement consumers, set `reallocationPenaltyAssets: 0n` in handwritten V1 or no-penalty action descriptors, and explicitly set `maxPenalty` when opting into a nonzero Vault V2 allocator penalty. Explicit and hand-built penalties remain supported up to WAD (100%), preserving the existing maximum.

  Name allocation-cap helpers `adapterCapId`, `collateralCapId`, and `adapterMarketCapId`. Preserve the published `adapterId`, `collateralId`, and `marketParamsId` helpers as deprecated aliases.

  Add an explicit `MorphoBorrowWithVaultV2ReallocationsOptions` WDK opt-in for Vault V2 reallocations and their possible approval requirement while preserving the legacy Vault V1-only `MorphoBorrowOptions` input and authorization-only requirement result type. Reallocation plans must use exactly one vault version per transaction.

### Patch Changes

- Updated dependencies [[`402175b`](https://github.com/morpho-org/sdks/commit/402175b32cc37e0da9e7b33495080a695941fa71), [`cde4052`](https://github.com/morpho-org/sdks/commit/cde4052c5f72e8345aae1b4ae863290e7c5b7f66)]:
  - @morpho-org/morpho-ts@2.10.0
  - @morpho-org/blue-sdk@6.6.0

## 5.2.1

### Patch Changes

- [#891](https://github.com/morpho-org/sdks/pull/891) [`6c14469`](https://github.com/morpho-org/sdks/commit/6c14469d3532d379139d74bcf5dd710e43544fa0) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Respect Vault V2 receive-share gates when accruing performance and management fees, including in fetched accrual state and downstream transaction share-price bounds.

- Updated dependencies [[`6c14469`](https://github.com/morpho-org/sdks/commit/6c14469d3532d379139d74bcf5dd710e43544fa0)]:
  - @morpho-org/blue-sdk@6.4.0

## 5.2.0

### Minor Changes

- [#845](https://github.com/morpho-org/sdks/pull/845) [`966bdc4`](https://github.com/morpho-org/sdks/commit/966bdc413e54f1cef65fffed7da92479f1322baf) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Add `fetchAccrualVaultV2Deployless`, a deployless-only reader that fetches the full VaultV2 accrual tree in a single `eth_call`.

  `fetchAccrualVaultV2` chains sequential reads dictated by the VaultV2 architecture — the vault, then each adapter (resolving its type), then each adapter's Morpho Blue markets or wrapped MetaMorpho V1 vault. The new `fetchAccrualVaultV2Deployless` traverses the entire tree on-chain through a new deployless `GetAccrualVaultV2` query and returns the hydrated `AccrualVaultV2` from one round-trip. It has no multicall fallback (equivalent to `deployless: "force"`) and requires every configured adapter factory to be deployed at the queried block.

  The returned entity is byte-for-byte identical to `fetchAccrualVaultV2` — same `maxDeposit`, `maxWithdraw`, `accrueInterest`, and per-adapter `realAssets`, and the nested MetaMorpho V1 vault of a `MorphoVaultV1Adapter` carries the same optional fields the multicall path reads: its EIP-5267 domain (`eip5267Domain`) and PublicAllocator config (`publicAllocatorConfig`, both vault-level and per-market). These are read in the same single `eth_call`, so the default path drops no field.

  `fetchAccrualVaultV2` now uses this single deployless call by default and only falls back to its previous sequential multicall reads when the call fails (or when `deployless` is `false`). Its signature and results are unchanged; it just issues far fewer RPC round-trips.

### Patch Changes

- [#873](https://github.com/morpho-org/sdks/pull/873) [`552ab7b`](https://github.com/morpho-org/sdks/commit/552ab7b9d00e8bb0ec8c6718c798ccc1943d76d4) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - fix(blue-sdk-viem): stop the deployless holding query from reverting on chains without Permit2

  The deployless `GetHolding` query called `permit2.allowance(...)` unconditionally. On
  chains that have no Permit2 deployment, `fetchHolding` passes `address(0)`, so the
  external call reverted (an addressless contract), forcing every deployless holding read
  to fall back to multicall — and throwing outright under `deployless: "force"`. The query
  now skips the Permit2 call when the address is zero and leaves `permit2BundlerAllowance`
  at its zero default, matching the multicall fallback.

## 5.1.3

### Patch Changes

- [#862](https://github.com/morpho-org/sdks/pull/862) [`5a39d63`](https://github.com/morpho-org/sdks/commit/5a39d6314afb5a8a236242090ec3c40623aebf57) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Fix published CJS/ESM package entrypoint metadata so legacy main/type resolution and conditional exports point at built files.

- Updated dependencies [[`5a39d63`](https://github.com/morpho-org/sdks/commit/5a39d6314afb5a8a236242090ec3c40623aebf57)]:
  - @morpho-org/blue-sdk@6.3.1

## 5.1.2

### Patch Changes

- [#828](https://github.com/morpho-org/sdks/pull/828) [`830c27e`](https://github.com/morpho-org/sdks/commit/830c27ecfde39d371f406475e3a7edb79ae41da1) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Add World Chain USDC with permit version 2 support to the shared address registry.

  Normalize fallback Circle permit token address checks so known USDC/EURC addresses use permit domain version `"2"` regardless of caller-provided address casing.

  Patch maintained packages with direct runtime dependencies on `@morpho-org/morpho-ts` so their latest releases resolve the new registry entry.

- [#712](https://github.com/morpho-org/sdks/pull/712) [`93f0c1a`](https://github.com/morpho-org/sdks/commit/93f0c1a2f923d0047c421049f7ffab8f0d66d0c4) Thanks [@0xbulma](https://github.com/0xbulma)! - Move shared Blue and Midnight SDK primitives to `@morpho-org/morpho-ts`: chain metadata, address/deployment registries, fixed-point math helpers, shared bigint types, typed registry/math errors, `ORACLE_PRICE_SCALE`, `assertNonNegative`, and `_try`.

  Expose shared ABI literals through `@morpho-org/morpho-ts/abis` so root utility imports do not load the ABI table.

  Model addresses as a unified flat Morpho registry so Blue and Midnight addresses live on the same chain entry and resolve through the protocol-agnostic `getChainAddresses`, `getChainAddress`, and `registerCustomAddresses` helpers.

  Keep `@morpho-org/blue-sdk` compatible by re-exporting the extracted chain, address, math, `_try`, and error surfaces from `@morpho-org/morpho-ts`, and remove the now-unused lodash registry merge dependencies from `@morpho-org/blue-sdk`.

  Expose the shared address registry helpers and registry types through `@morpho-org/morpho-sdk` so integrators can import the cross-protocol address surface from the main SDK package.

  Update maintained dependents of `@morpho-org/blue-sdk` and `@morpho-org/morpho-ts`, including peer dependents, so published packages resolve the extracted shared primitives used by the Blue SDK compatibility layer.

- [#823](https://github.com/morpho-org/sdks/pull/823) [`e0208c2`](https://github.com/morpho-org/sdks/commit/e0208c299fa68552cc2b93adbd93b5d30ecaff5c) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Fix the deployless `GetVault` query reverting on all MetaMorpho vaults.

  `fetchVault` (and `fetchAccrualVault`) silently fell back to multicall because the deployless query reverted while decoding the EIP-5267 domain: reading the high-level `eip712Domain()` struct return hits a Solidity via-IR decoding regression that reverts on valid domains. The query now decodes the raw `eip712Domain()` returndata as a tuple, the same workaround already used by `GetToken`. `deployless: "force"` no longer throws and the deployless fast path is restored (one RPC round-trip instead of a full multicall).

  The deployless query now also reads `lostAssets` (MetaMorpho V1.1), so the deployless and multicall paths return identical `Vault` state.

- Updated dependencies [[`1848eb4`](https://github.com/morpho-org/sdks/commit/1848eb47e794acbf50eedd4a10eb51fee8576a1b), [`830c27e`](https://github.com/morpho-org/sdks/commit/830c27ecfde39d371f406475e3a7edb79ae41da1), [`93f0c1a`](https://github.com/morpho-org/sdks/commit/93f0c1a2f923d0047c421049f7ffab8f0d66d0c4), [`8baeac7`](https://github.com/morpho-org/sdks/commit/8baeac71ff62689407b5f9bf2fcb839326de0bcb)]:
  - @morpho-org/morpho-ts@2.7.0
  - @morpho-org/blue-sdk@6.3.0

## 5.1.1

### Patch Changes

- [#782](https://github.com/morpho-org/sdks/pull/782) [`bb82f64`](https://github.com/morpho-org/sdks/commit/bb82f6488986e91b228469dca12444a962922c84) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Refresh direct runtime dependencies as part of the weekly SDK dependency update.

  Updated the WDK wallet/runtime dependencies for `@morpho-org/wdk-protocol-lending-morpho-evm`. Peer dependency ranges did not require widening for the updated devDependencies. Deprecated packages stayed frozen. The Biome schema was synchronized with the updated Biome devDependency, and checksum-address lint refreshed `@morpho-org/blue-sdk-viem` source examples for the updated `viem` checksum output.

- Updated dependencies [[`229fa2e`](https://github.com/morpho-org/sdks/commit/229fa2ed33e2a55fc597dca96220ec4666fc481c), [`fab0186`](https://github.com/morpho-org/sdks/commit/fab018666faef372a7f695edcd4b54e658f73118)]:
  - @morpho-org/blue-sdk@6.2.0

## 5.1.0

### Minor Changes

- [#758](https://github.com/morpho-org/sdks/pull/758) [`95b07ef`](https://github.com/morpho-org/sdks/commit/95b07ef56b8146f1084a35834243df4a7399a51d) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Add public JSDoc coverage for blue-sdk-viem exports.

### Patch Changes

- Updated dependencies [[`401cf32`](https://github.com/morpho-org/sdks/commit/401cf3244b32fcb00f6c7676b2a43e34a0283cad), [`738421e`](https://github.com/morpho-org/sdks/commit/738421e4a428ce361d2fe551746b0c406a0fe31f), [`6d59b5a`](https://github.com/morpho-org/sdks/commit/6d59b5abdcdab7f5da3df826ea4556899a5b765d), [`43e6cfc`](https://github.com/morpho-org/sdks/commit/43e6cfcf7eaab0355dccbe3f9f55c59cdac72f0a)]:
  - @morpho-org/blue-sdk@6.1.0
  - @morpho-org/morpho-ts@2.6.0

## 5.0.1

### Patch Changes

- [#742](https://github.com/morpho-org/sdks/pull/742) [`25ba440`](https://github.com/morpho-org/sdks/commit/25ba440e708a95770959af425f60ce82fdc553c7) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Fix npm source metadata by publishing full repository URLs and monorepo package directories.

- Updated dependencies [[`25ba440`](https://github.com/morpho-org/sdks/commit/25ba440e708a95770959af425f60ce82fdc553c7)]:
  - @morpho-org/blue-sdk@6.0.1
  - @morpho-org/morpho-ts@2.5.3

## 5.0.0

### Major Changes

- [#681](https://github.com/morpho-org/sdks/pull/681) [`c9796ab`](https://github.com/morpho-org/sdks/commit/c9796ab033c7fe3ac7241542f3b1a85d17e9b987) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - **`blue-sdk`** — Fix `VaultV2._wrap` / `_unwrap` (and everything layered on them: `toAssets`, `toShares`, `maxWithdraw`, plus `previewWithdrawShares` in `deallocation.ts`) overstating assets whenever management or performance fees are pending. The previous math paired **post-accrue** `totalAssets` (from `accrueInterestView`) with **pre-accrue** `totalSupply` (still missing the fee shares the next accrual will mint), overshooting the share price by `~ pendingFeeShares / totalSupply`. Conversions now pair stored `_totalAssets` with stored `totalSupply` — both pre-accrue, internally consistent. Call `AccrualVaultV2.accrueInterest(timestamp)` for post-accrue math; it rolls `_totalAssets` forward and mints pending fee shares into `totalSupply` atomically. `AccrualVaultV2.maxDeposit`'s relative-cap check now reads `_totalAssets` instead of `totalAssets`.

  **Breaking:** `VaultV2.totalAssets` is removed (it always equalled `_totalAssets` after the fix). Read `_totalAssets` instead.

  **`blue-sdk-viem`** — `fetchVaultV2` no longer calls `vault.totalAssets()` (deployless and multicall paths), saving one RPC read per fetch.

  **`morpho-sdk`** — `MorphoVaultV2.deposit` and `MorphoVaultV1.migrateToV2` previously sized `maxSharePrice` from `vaultData.toShares(amount)` directly. With the conversion fix above, that share count is now pre-accrue, so the bound was below the actual onchain share price at execution and every bundled deposit reverted with `SlippageExceeded` (`0x8199f5f3`) inside `GeneralAdapter1`. Both entities now forward-accrue the target VaultV2 by 2h before computing the bound, mirroring `MorphoMarketV1.repay`'s shares-mode pattern.

### Patch Changes

- Updated dependencies [[`c9796ab`](https://github.com/morpho-org/sdks/commit/c9796ab033c7fe3ac7241542f3b1a85d17e9b987)]:
  - @morpho-org/blue-sdk@6.0.0

## 4.6.6

### Patch Changes

- [#652](https://github.com/morpho-org/sdks/pull/652) [`81825a8`](https://github.com/morpho-org/sdks/commit/81825a8864d8c4228c8476380d1ad7e76a5ee1c0) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Reject EIP-5267 permit domains that advertise unsupported extension fields before requesting a signature.

- Updated dependencies [[`9dce8b7`](https://github.com/morpho-org/sdks/commit/9dce8b7047266badf7c7c813074a08f51ccb8c0a), [`1481e91`](https://github.com/morpho-org/sdks/commit/1481e91fd7e3382145b22d98c5156887c2b6496e)]:
  - @morpho-org/blue-sdk@5.23.3
