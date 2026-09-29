# @morpho-org/morpho-test

## 4.0.4

### Patch Changes

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

- Updated dependencies [[`800f2e1`](https://github.com/morpho-org/sdks/commit/800f2e1f0523de39fe9055b2f077ebf5f72e5d57), [`a8167e7`](https://github.com/morpho-org/sdks/commit/a8167e7505cc6ca1baa789e239e0f944d5a6e47c), [`0e72b04`](https://github.com/morpho-org/sdks/commit/0e72b0439aa46c7a7d6b4e6fad6d2d9c79c2e45e), [`468422d`](https://github.com/morpho-org/sdks/commit/468422d90019029b3d18ac239bf6fbb19748c22e)]:
  - @morpho-org/morpho-ts@3.0.0
  - @morpho-org/blue-sdk@7.0.0

## 4.0.4-next.0

### Patch Changes

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

- Updated dependencies [[`0e72b04`](https://github.com/morpho-org/sdks/commit/0e72b0439aa46c7a7d6b4e6fad6d2d9c79c2e45e)]:
  - @morpho-org/morpho-ts@3.0.0-next.0
  - @morpho-org/blue-sdk@7.0.0-next.1

## 4.0.3

### Patch Changes

- [#862](https://github.com/morpho-org/sdks/pull/862) [`5a39d63`](https://github.com/morpho-org/sdks/commit/5a39d6314afb5a8a236242090ec3c40623aebf57) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Fix published CJS/ESM package entrypoint metadata so legacy main/type resolution and conditional exports point at built files.

- Updated dependencies [[`5a39d63`](https://github.com/morpho-org/sdks/commit/5a39d6314afb5a8a236242090ec3c40623aebf57)]:
  - @morpho-org/blue-sdk@6.3.1

## 4.0.2

### Patch Changes

- [#712](https://github.com/morpho-org/sdks/pull/712) [`93f0c1a`](https://github.com/morpho-org/sdks/commit/93f0c1a2f923d0047c421049f7ffab8f0d66d0c4) Thanks [@0xbulma](https://github.com/0xbulma)! - Move shared Blue and Midnight SDK primitives to `@morpho-org/morpho-ts`: chain metadata, address/deployment registries, fixed-point math helpers, shared bigint types, typed registry/math errors, `ORACLE_PRICE_SCALE`, `assertNonNegative`, and `_try`.

  Expose shared ABI literals through `@morpho-org/morpho-ts/abis` so root utility imports do not load the ABI table.

  Model addresses as a unified flat Morpho registry so Blue and Midnight addresses live on the same chain entry and resolve through the protocol-agnostic `getChainAddresses`, `getChainAddress`, and `registerCustomAddresses` helpers.

  Keep `@morpho-org/blue-sdk` compatible by re-exporting the extracted chain, address, math, `_try`, and error surfaces from `@morpho-org/morpho-ts`, and remove the now-unused lodash registry merge dependencies from `@morpho-org/blue-sdk`.

  Expose the shared address registry helpers and registry types through `@morpho-org/morpho-sdk` so integrators can import the cross-protocol address surface from the main SDK package.

  Update maintained dependents of `@morpho-org/blue-sdk` and `@morpho-org/morpho-ts`, including peer dependents, so published packages resolve the extracted shared primitives used by the Blue SDK compatibility layer.

- Updated dependencies [[`1848eb4`](https://github.com/morpho-org/sdks/commit/1848eb47e794acbf50eedd4a10eb51fee8576a1b), [`830c27e`](https://github.com/morpho-org/sdks/commit/830c27ecfde39d371f406475e3a7edb79ae41da1), [`93f0c1a`](https://github.com/morpho-org/sdks/commit/93f0c1a2f923d0047c421049f7ffab8f0d66d0c4), [`8baeac7`](https://github.com/morpho-org/sdks/commit/8baeac71ff62689407b5f9bf2fcb839326de0bcb)]:
  - @morpho-org/morpho-ts@2.7.0
  - @morpho-org/blue-sdk@6.3.0

## 4.0.1

### Patch Changes

- [#742](https://github.com/morpho-org/sdks/pull/742) [`25ba440`](https://github.com/morpho-org/sdks/commit/25ba440e708a95770959af425f60ce82fdc553c7) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Fix npm source metadata by publishing full repository URLs and monorepo package directories.

- Updated dependencies [[`25ba440`](https://github.com/morpho-org/sdks/commit/25ba440e708a95770959af425f60ce82fdc553c7)]:
  - @morpho-org/blue-sdk@6.0.1
  - @morpho-org/morpho-ts@2.5.3
  - @morpho-org/test@2.8.1

## 4.0.0

### Patch Changes

- Updated dependencies [[`79443e5`](https://github.com/morpho-org/sdks/commit/79443e5814e939428b7e5bbeb30729903305cf81), [`79443e5`](https://github.com/morpho-org/sdks/commit/79443e5814e939428b7e5bbeb30729903305cf81)]:
  - @morpho-org/test@2.8.0

## 3.0.0

### Patch Changes

- Updated dependencies [[`c9796ab`](https://github.com/morpho-org/sdks/commit/c9796ab033c7fe3ac7241542f3b1a85d17e9b987)]:
  - @morpho-org/blue-sdk@6.0.0
