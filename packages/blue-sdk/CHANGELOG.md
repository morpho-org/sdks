# @morpho-org/blue-sdk

## 6.5.0

### Minor Changes

- [#915](https://github.com/morpho-org/sdks/pull/915) [`2c76ea5`](https://github.com/morpho-org/sdks/commit/2c76ea50ee1f29d2c3a5a74f9bddd9e34910378a) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Add a `bundles` group to `ChainAddresses` for standalone bundle periphery contracts, starting with
  `bundles.vaultExitBundlesV1`. The `AddressLabel` union gains `bundles.vaultExitBundlesV1`, so
  `getChainAddress(chainId, "bundles.vaultExitBundlesV1")` and `registerCustomAddresses` resolve the
  new entry like any other registry address. Register the canonical `VaultExitBundlesV1` deployments
  and deployment blocks on Ethereum, Base, Arbitrum, Optimism, Polygon, World Chain, Unichain,
  HyperEVM, Katana, Monad, Stable, Tempo, and Robinhood Chain.

  Patch maintained packages with direct runtime dependencies on `@morpho-org/morpho-ts` so their
  latest releases resolve the new registry entry.

  Add Vault V1 and Vault V2 in-kind redemption actions and entity methods backed by
  VaultExitBundlesV1, including bounded share permit/approval requirements, Vault V2's two-field
  permit domain, snapshot coverage validation, and Morpho Blue balance checks.
  Vault V2's `toShares` now accepts an optional rounding direction so callers can reproduce its
  rounded-up withdrawal preview without duplicating share-conversion math.
  Vault V1 exits also reject vaults configured as Morpho Blue's fee recipient, which the periphery
  cannot safely account for when protocol fee shares accrue.
  Add a minimal Vault V2 preview helper for frontend eligibility, market capacity, and proceeds.
  Match the deployed contract at upstream commit `9994e6abe5b18d5f7e0d6bd666f85eb259e3312f`,
  including its idle-assets-first Vault V2 exit behavior. The deployed ABI is unchanged. Fork tests
  now use the canonical Ethereum deployment directly.

### Patch Changes

- Updated dependencies [[`2c76ea5`](https://github.com/morpho-org/sdks/commit/2c76ea50ee1f29d2c3a5a74f9bddd9e34910378a)]:
  - @morpho-org/morpho-ts@2.9.0

## 6.4.0

### Minor Changes

- [#891](https://github.com/morpho-org/sdks/pull/891) [`6c14469`](https://github.com/morpho-org/sdks/commit/6c14469d3532d379139d74bcf5dd710e43544fa0) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Respect Vault V2 receive-share gates when accruing performance and management fees, including in fetched accrual state and downstream transaction share-price bounds.

## 6.3.1

### Patch Changes

- [#862](https://github.com/morpho-org/sdks/pull/862) [`5a39d63`](https://github.com/morpho-org/sdks/commit/5a39d6314afb5a8a236242090ec3c40623aebf57) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Fix published CJS/ESM package entrypoint metadata so legacy main/type resolution and conditional exports point at built files.

## 6.3.0

### Minor Changes

- [#712](https://github.com/morpho-org/sdks/pull/712) [`93f0c1a`](https://github.com/morpho-org/sdks/commit/93f0c1a2f923d0047c421049f7ffab8f0d66d0c4) Thanks [@0xbulma](https://github.com/0xbulma)! - Move shared Blue and Midnight SDK primitives to `@morpho-org/morpho-ts`: chain metadata, address/deployment registries, fixed-point math helpers, shared bigint types, typed registry/math errors, `ORACLE_PRICE_SCALE`, `assertNonNegative`, and `_try`.

  Expose shared ABI literals through `@morpho-org/morpho-ts/abis` so root utility imports do not load the ABI table.

  Model addresses as a unified flat Morpho registry so Blue and Midnight addresses live on the same chain entry and resolve through the protocol-agnostic `getChainAddresses`, `getChainAddress`, and `registerCustomAddresses` helpers.

  Keep `@morpho-org/blue-sdk` compatible by re-exporting the extracted chain, address, math, `_try`, and error surfaces from `@morpho-org/morpho-ts`, and remove the now-unused lodash registry merge dependencies from `@morpho-org/blue-sdk`.

  Expose the shared address registry helpers and registry types through `@morpho-org/morpho-sdk` so integrators can import the cross-protocol address surface from the main SDK package.

  Update maintained dependents of `@morpho-org/blue-sdk` and `@morpho-org/morpho-ts`, including peer dependents, so published packages resolve the extracted shared primitives used by the Blue SDK compatibility layer.

### Patch Changes

- Updated dependencies [[`1848eb4`](https://github.com/morpho-org/sdks/commit/1848eb47e794acbf50eedd4a10eb51fee8576a1b), [`830c27e`](https://github.com/morpho-org/sdks/commit/830c27ecfde39d371f406475e3a7edb79ae41da1), [`93f0c1a`](https://github.com/morpho-org/sdks/commit/93f0c1a2f923d0047c421049f7ffab8f0d66d0c4), [`8baeac7`](https://github.com/morpho-org/sdks/commit/8baeac71ff62689407b5f9bf2fcb839326de0bcb)]:
  - @morpho-org/morpho-ts@2.7.0

## 6.2.0

### Minor Changes

- [#752](https://github.com/morpho-org/sdks/pull/752) [`229fa2e`](https://github.com/morpho-org/sdks/commit/229fa2ed33e2a55fc597dca96220ec4666fc481c) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Add Morph and MegaETH chain metadata, deployment addresses, deployment block lower bounds, and wrapped-native mappings.

  Patch maintained packages that depend directly on `@morpho-org/blue-sdk` so their latest releases resolve the new address registry.

- [#783](https://github.com/morpho-org/sdks/pull/783) [`fab0186`](https://github.com/morpho-org/sdks/commit/fab018666faef372a7f695edcd4b54e658f73118) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Throw `UnknownMarketAllocationError` when accruing interest on a vault whose withdraw queue references a market without an allocation.

## 6.1.0

### Minor Changes

- [#746](https://github.com/morpho-org/sdks/pull/746) [`401cf32`](https://github.com/morpho-org/sdks/commit/401cf3244b32fcb00f6c7676b2a43e34a0283cad) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Add Arc chain metadata, deployment addresses, deployment block lower bounds, and native-token mapping.

  Patch maintained packages that depend directly on `@morpho-org/blue-sdk` so their latest releases resolve the new address registry.

- [#757](https://github.com/morpho-org/sdks/pull/757) [`738421e`](https://github.com/morpho-org/sdks/commit/738421e4a428ce361d2fe551746b0c406a0fe31f) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Add JSDoc coverage for the exported blue-sdk surface.

### Patch Changes

- [#740](https://github.com/morpho-org/sdks/pull/740) [`43e6cfc`](https://github.com/morpho-org/sdks/commit/43e6cfcf7eaab0355dccbe3f9f55c59cdac72f0a) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Remove an unreachable borrow-capacity branch and keep sidecar test fixtures out of package builds.

- Updated dependencies [[`6d59b5a`](https://github.com/morpho-org/sdks/commit/6d59b5abdcdab7f5da3df826ea4556899a5b765d)]:
  - @morpho-org/morpho-ts@2.6.0

## 6.0.1

### Patch Changes

- [#742](https://github.com/morpho-org/sdks/pull/742) [`25ba440`](https://github.com/morpho-org/sdks/commit/25ba440e708a95770959af425f60ce82fdc553c7) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Fix npm source metadata by publishing full repository URLs and monorepo package directories.

- Updated dependencies [[`25ba440`](https://github.com/morpho-org/sdks/commit/25ba440e708a95770959af425f60ce82fdc553c7)]:
  - @morpho-org/morpho-ts@2.5.3

## 6.0.0

### Major Changes

- [#681](https://github.com/morpho-org/sdks/pull/681) [`c9796ab`](https://github.com/morpho-org/sdks/commit/c9796ab033c7fe3ac7241542f3b1a85d17e9b987) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - **`blue-sdk`** — Fix `VaultV2._wrap` / `_unwrap` (and everything layered on them: `toAssets`, `toShares`, `maxWithdraw`, plus `previewWithdrawShares` in `deallocation.ts`) overstating assets whenever management or performance fees are pending. The previous math paired **post-accrue** `totalAssets` (from `accrueInterestView`) with **pre-accrue** `totalSupply` (still missing the fee shares the next accrual will mint), overshooting the share price by `~ pendingFeeShares / totalSupply`. Conversions now pair stored `_totalAssets` with stored `totalSupply` — both pre-accrue, internally consistent. Call `AccrualVaultV2.accrueInterest(timestamp)` for post-accrue math; it rolls `_totalAssets` forward and mints pending fee shares into `totalSupply` atomically. `AccrualVaultV2.maxDeposit`'s relative-cap check now reads `_totalAssets` instead of `totalAssets`.

  **Breaking:** `VaultV2.totalAssets` is removed (it always equalled `_totalAssets` after the fix). Read `_totalAssets` instead.

  **`blue-sdk-viem`** — `fetchVaultV2` no longer calls `vault.totalAssets()` (deployless and multicall paths), saving one RPC read per fetch.

  **`morpho-sdk`** — `MorphoVaultV2.deposit` and `MorphoVaultV1.migrateToV2` previously sized `maxSharePrice` from `vaultData.toShares(amount)` directly. With the conversion fix above, that share count is now pre-accrue, so the bound was below the actual onchain share price at execution and every bundled deposit reverted with `SlippageExceeded` (`0x8199f5f3`) inside `GeneralAdapter1`. Both entities now forward-accrue the target VaultV2 by 2h before computing the bound, mirroring `MorphoMarketV1.repay`'s shares-mode pattern.

## 5.23.3

### Patch Changes

- [#653](https://github.com/morpho-org/sdks/pull/653) [`9dce8b7`](https://github.com/morpho-org/sdks/commit/9dce8b7047266badf7c7c813074a08f51ccb8c0a) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Fix market interest accrual fee-share minting to match Morpho Blue onchain behavior.

- [#648](https://github.com/morpho-org/sdks/pull/648) [`1481e91`](https://github.com/morpho-org/sdks/commit/1481e91fd7e3382145b22d98c5156887c2b6496e) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Refresh packages that need a release after direct dependency, peer dependency, or source compatibility changes.

  - Update direct runtime dependency ranges for packages using `@noble/hashes`, `zod`, `@velora-dex/sdk`, `mutative`, `viem-deal`, and `viem-tracer`.
  - Widen React and TypeScript peer ranges in the Wagmi adapters only where the updated development dependencies require it, while preserving the previous lower-bound support.
  - Keep the SDK source compatible with the refreshed toolchain and libraries, including TypeScript 6, `@noble/hashes` 2.x subpath imports, TanStack Query/Wagmi inference changes, and viem error formatting; related tests/assertions were updated to match the refreshed dependencies.
