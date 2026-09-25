# @morpho-org/midnight-sdk

## 1.8.0

### Minor Changes

- [#971](https://github.com/morpho-org/sdks/pull/971) [`9ac0ea5`](https://github.com/morpho-org/sdks/commit/9ac0ea55b93225a62ddeabb1c625064319be728d) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Reuse Merkle tree layers across proofs in `ratify()`; add `TreeUtils.buildProofs`. `TreeUtils.buildProof` and `TreeUtils.buildProofs` now throw `InvalidTreeError` for non-power-of-two leaf sets and `InvalidTreeHeightError` for trees above height 20.

## 1.7.0

### Minor Changes

- [#1116](https://github.com/morpho-org/sdks/pull/1116) [`3939507`](https://github.com/morpho-org/sdks/commit/39395072170d111956914669720e46e593f5b9ac) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - `MidnightApi` takeable-offer mappers (`fetchBookQuote`, `fetchBookTakeableOffers`, `fetchTakeableOffers`) now reject offers that cannot be executed by the Midnight contract: caps must set exactly one non-zero `uint128` cap, `receiverIfMakerIsSeller` must be a well-formed address, and buy offers must carry a zero `receiverIfMakerIsSeller`. Such responses throw `InvalidMidnightApiResponseError` instead of being quoted and skipped onchain, which could otherwise fall through to worse-priced liquidity.

  `MidnightApi.fetchBookQuote` now throws the new `InvalidMidnightApiQuoteTargetError` when the runtime input does not set exactly one of `units` or `assets`, instead of sending both query parameters and silently evaluating the `units` branch. The error is re-exported from `@morpho-org/morpho-sdk/errors` and `@morpho-org/morpho-sdk/midnight/errors`.

### Patch Changes

- [#1120](https://github.com/morpho-org/sdks/pull/1120) [`c9c8fbd`](https://github.com/morpho-org/sdks/commit/c9c8fbdcb4683e902a2c484efb52e1f58cb2cfcc) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - `fetchMarket` and `fetchAccrualVaultV2` now detect the Adaptive Curve IRM case-insensitively, so `rateAtTarget` is populated on deployments whose registry entry is not checksummed.

  `MidnightApi.fetchBook` / `fetchBooks` now return `collaterals` in the protocol's canonical order, so the array index matches the onchain `collateralIndex` used by Midnight actions.

- [#1125](https://github.com/morpho-org/sdks/pull/1125) [`047e86c`](https://github.com/morpho-org/sdks/commit/047e86cf02c2a4bdd2ef11d47510b8762b4f5447) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Correct `Offer.create` JSDoc for `continuousFeeCap`: the actual default is `0n` (fail-closed — no market continuous fee is accepted unless set explicitly), not `MAX_CONTINUOUS_FEE` as previously documented. No behavior change.

  Refs SDK-1009

- [#1122](https://github.com/morpho-org/sdks/pull/1122) [`4ea5fe9`](https://github.com/morpho-org/sdks/commit/4ea5fe9845d9b9f1e736a33d37cd8aa4c045cb47) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Reject `MidnightApi.fetchBooks` results outside the requested filters. `fetchBooks` now throws `InvalidMidnightApiResponseError` when a returned book falls outside any supplied `chainIds`, `loanTokens`, `collateralTokens`, or `maturities` filter, extending the existing `marketIds` binding so a hostile or compromised API cannot return a coherent foreign market for a filtered listing. `morpho-sdk` re-exports this API via its `/midnight-api` facade and takes a matching patch.

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

- [#1121](https://github.com/morpho-org/sdks/pull/1121) [`e3e5893`](https://github.com/morpho-org/sdks/commit/e3e5893e0b90db7963d24176165ac82d5f79e7b8) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Sort Midnight API book price levels best first (asks ascending tick, bids descending tick) instead of trusting API order.

- [#1061](https://github.com/morpho-org/sdks/pull/1061) [`8d74feb`](https://github.com/morpho-org/sdks/commit/8d74feb2ca41210d70fb0a593641da4a4994e350) Thanks [@jinmel](https://github.com/jinmel)! - Reject in-kind exit and permit deadlines outside uint256 before encoding or exposing approval requirements. Validate Vault V1 withdrawal utilization defaults and per-market overrides between zero and WAD. Pass market tick spacing in fixed-rate offer-chain examples.

- Updated dependencies [[`800f2e1`](https://github.com/morpho-org/sdks/commit/800f2e1f0523de39fe9055b2f077ebf5f72e5d57), [`a8167e7`](https://github.com/morpho-org/sdks/commit/a8167e7505cc6ca1baa789e239e0f944d5a6e47c), [`0e72b04`](https://github.com/morpho-org/sdks/commit/0e72b0439aa46c7a7d6b4e6fad6d2d9c79c2e45e)]:
  - @morpho-org/morpho-ts@3.0.0

## 1.7.0-next.0

### Minor Changes

- [#1116](https://github.com/morpho-org/sdks/pull/1116) [`3939507`](https://github.com/morpho-org/sdks/commit/39395072170d111956914669720e46e593f5b9ac) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - `MidnightApi` takeable-offer mappers (`fetchBookQuote`, `fetchBookTakeableOffers`, `fetchTakeableOffers`) now reject offers that cannot be executed by the Midnight contract: caps must set exactly one non-zero `uint128` cap, `receiverIfMakerIsSeller` must be a well-formed address, and buy offers must carry a zero `receiverIfMakerIsSeller`. Such responses throw `InvalidMidnightApiResponseError` instead of being quoted and skipped onchain, which could otherwise fall through to worse-priced liquidity.

  `MidnightApi.fetchBookQuote` now throws the new `InvalidMidnightApiQuoteTargetError` when the runtime input does not set exactly one of `units` or `assets`, instead of sending both query parameters and silently evaluating the `units` branch. The error is re-exported from `@morpho-org/morpho-sdk/errors` and `@morpho-org/morpho-sdk/midnight/errors`.

### Patch Changes

- [#1120](https://github.com/morpho-org/sdks/pull/1120) [`c9c8fbd`](https://github.com/morpho-org/sdks/commit/c9c8fbdcb4683e902a2c484efb52e1f58cb2cfcc) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - `fetchMarket` and `fetchAccrualVaultV2` now detect the Adaptive Curve IRM case-insensitively, so `rateAtTarget` is populated on deployments whose registry entry is not checksummed.

  `MidnightApi.fetchBook` / `fetchBooks` now return `collaterals` in the protocol's canonical order, so the array index matches the onchain `collateralIndex` used by Midnight actions.

- [#1125](https://github.com/morpho-org/sdks/pull/1125) [`047e86c`](https://github.com/morpho-org/sdks/commit/047e86cf02c2a4bdd2ef11d47510b8762b4f5447) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Correct `Offer.create` JSDoc for `continuousFeeCap`: the actual default is `0n` (fail-closed — no market continuous fee is accepted unless set explicitly), not `MAX_CONTINUOUS_FEE` as previously documented. No behavior change.

  Refs SDK-1009

- [#1122](https://github.com/morpho-org/sdks/pull/1122) [`4ea5fe9`](https://github.com/morpho-org/sdks/commit/4ea5fe9845d9b9f1e736a33d37cd8aa4c045cb47) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Reject `MidnightApi.fetchBooks` results outside the requested filters. `fetchBooks` now throws `InvalidMidnightApiResponseError` when a returned book falls outside any supplied `chainIds`, `loanTokens`, `collateralTokens`, or `maturities` filter, extending the existing `marketIds` binding so a hostile or compromised API cannot return a coherent foreign market for a filtered listing. `morpho-sdk` re-exports this API via its `/midnight-api` facade and takes a matching patch.

- [#1121](https://github.com/morpho-org/sdks/pull/1121) [`e3e5893`](https://github.com/morpho-org/sdks/commit/e3e5893e0b90db7963d24176165ac82d5f79e7b8) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Sort Midnight API book price levels best first (asks ascending tick, bids descending tick) instead of trusting API order.

- Updated dependencies [[`800f2e1`](https://github.com/morpho-org/sdks/commit/800f2e1f0523de39fe9055b2f077ebf5f72e5d57), [`a8167e7`](https://github.com/morpho-org/sdks/commit/a8167e7505cc6ca1baa789e239e0f944d5a6e47c)]:
  - @morpho-org/morpho-ts@3.0.0-next.1

## 1.6.0

### Minor Changes

- [#1102](https://github.com/morpho-org/sdks/pull/1102) [`d98eca5`](https://github.com/morpho-org/sdks/commit/d98eca535fdbf389b2a77e2d42f1dd10cb78139e) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Register the Robinhood Chain (chain 4663) Midnight deployments from morpho-org/deployments
  address-book.json: `midnight`, `midnightBundles`, `midnightBlueBuyCallbackFactory`, `midnightMempool`,
  `ecrecoverRatifier`, `ecrecoverAuthorizer`, `setterRatifier`, each with its deployment block in the
  registry. `getChainAddress(ChainId.RobinhoodMainnet, ...)` now resolves these labels, so the Midnight
  SDK works on Robinhood Chain. Addresses are sourced byte-for-byte from the canonical deployment
  registry; deployment blocks were derived from the deployer contract creation receipts on Robinhood
  Chain.

### Patch Changes

- Updated dependencies [[`d98eca5`](https://github.com/morpho-org/sdks/commit/d98eca535fdbf389b2a77e2d42f1dd10cb78139e)]:
  - @morpho-org/morpho-ts@2.15.0

## 1.5.1-next.0

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

- [#1061](https://github.com/morpho-org/sdks/pull/1061) [`8d74feb`](https://github.com/morpho-org/sdks/commit/8d74feb2ca41210d70fb0a593641da4a4994e350) Thanks [@jinmel](https://github.com/jinmel)! - Reject in-kind exit and permit deadlines outside uint256 before encoding or exposing approval requirements. Validate Vault V1 withdrawal utilization defaults and per-market overrides between zero and WAD. Pass market tick spacing in fixed-rate offer-chain examples.

- Updated dependencies [[`0e72b04`](https://github.com/morpho-org/sdks/commit/0e72b0439aa46c7a7d6b4e6fad6d2d9c79c2e45e)]:
  - @morpho-org/morpho-ts@3.0.0-next.0

## 1.5.0

### Minor Changes

- [#1092](https://github.com/morpho-org/sdks/pull/1092) [`ab6d1b9`](https://github.com/morpho-org/sdks/commit/ab6d1b9760debb944dcb4a24ce327e359528fee8) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Register the remaining Arc (chain 5042) deployments from morpho-org/deployments address-book.json:
  the Vault V2 `BluePublicAllocator` (`vaultV2BluePublicAllocator`) and the full Midnight stack
  (`midnight`, `midnightBundles`, `midnightBlueBuyCallbackFactory`, `midnightMempool`,
  `ecrecoverRatifier`, `ecrecoverAuthorizer`, `setterRatifier`), each with its deployment block in the
  registry. `getChainAddress(ChainId.ArcMainnet, ...)` now resolves these labels, so Blue public
  allocations and the Midnight SDK work on Arc. Addresses are sourced byte-for-byte from the canonical
  deployment registry; deployment blocks were derived from the Arc archive node.

### Patch Changes

- Updated dependencies [[`2e899af`](https://github.com/morpho-org/sdks/commit/2e899af4063a70d37b2b48270dba85b4231d6cca), [`ab6d1b9`](https://github.com/morpho-org/sdks/commit/ab6d1b9760debb944dcb4a24ce327e359528fee8)]:
  - @morpho-org/morpho-ts@2.14.0

## 1.4.0-next.0

### Minor Changes

- [#1056](https://github.com/morpho-org/sdks/pull/1056) [`c4b4467`](https://github.com/morpho-org/sdks/commit/c4b44677e7a6881072eca0fe5eba54c3d9761b60) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Compute Midnight quote guards from rounded per-fill settlement amounts and an optional current settlement fee so returned offers cannot imply a worse aggregate price than the requested guard.

### Patch Changes

- [#1056](https://github.com/morpho-org/sdks/pull/1056) [`c4b4467`](https://github.com/morpho-org/sdks/commit/c4b44677e7a6881072eca0fe5eba54c3d9761b60) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Reject cached ratifier trees whose visible offers, padding, leaves, root, or height do not describe the same tree, and avoid revalidating the full tree for every ratified offer.

## 1.4.0

### Minor Changes

- [#1053](https://github.com/morpho-org/sdks/pull/1053) [`6a2b225`](https://github.com/morpho-org/sdks/commit/6a2b2254b9e851648956812afacc371ae16236d6) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Compute Midnight quote guards from rounded per-fill settlement amounts and an optional current settlement fee so returned offers cannot imply a worse aggregate price than the requested guard.

### Patch Changes

- [#1049](https://github.com/morpho-org/sdks/pull/1049) [`2c973f5`](https://github.com/morpho-org/sdks/commit/2c973f522e394722d056e808524dabe731ea0c6d) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - `OfferUtils.getConsumableUnits` now validates the settlement fee against the offer price before returning unit-capped capacity, so a unit-capped buy offer whose fee exceeds its price throws `SettlementFeeExceedsPriceError` instead of being reported as consumable.

- [#1022](https://github.com/morpho-org/sdks/pull/1022) [`cadae0f`](https://github.com/morpho-org/sdks/commit/cadae0fb873aa9bdeb2676845bd81eda401e7d01) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Reject cached ratifier trees whose visible offers, padding, leaves, root, or height do not describe the same tree, and avoid revalidating the full tree for every ratified offer.

- Updated dependencies [[`5e09aa2`](https://github.com/morpho-org/sdks/commit/5e09aa2c2bb091c9ace4a5bda200e2ca520227b2)]:
  - @morpho-org/morpho-ts@2.11.2

## 1.3.1

### Patch Changes

- [#1006](https://github.com/morpho-org/sdks/pull/1006) [`014364e`](https://github.com/morpho-org/sdks/commit/014364ee2e9efd45f16ca5104780f4ab041c9d65) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Bind `MidnightApi.fetchBook` and `fetchBooks` results to the requested market. Both now recompute the market id from each returned book's own params with `MarketUtils.toId` and throw `InvalidMidnightApiResponseError` when it does not match the advertised `market_id`, so a hostile or compromised API cannot pair a trusted id with foreign market metadata. `fetchBook` additionally rejects a book whose id differs from the requested one, and `fetchBooks` rejects any book outside a supplied `marketIds` filter. This mirrors the derive-and-compare rebinding already enforced on the takeable-offers path. `morpho-sdk` re-exports this API via its `/midnight/api` facade and takes a matching patch so facade consumers resolve the fixed dependency.

- Updated dependencies [[`2601458`](https://github.com/morpho-org/sdks/commit/26014581bf7470bc090c4837bd9ed3cf6fc8f31b)]:
  - @morpho-org/morpho-ts@2.11.1

## 1.3.0

### Minor Changes

- [#903](https://github.com/morpho-org/sdks/pull/903) [`d8ec434`](https://github.com/morpho-org/sdks/commit/d8ec434fc82ba50f9d601e04c61351b8a9f5dc89) Thanks [@yum0e](https://github.com/yum0e)! - Expose known Midnight mempool validation rules and normalize the `min_offer_assets_usd` details. Preserve unknown rules and non-null detail shapes so router policy additions remain compatible with older SDK clients.

## 1.2.1

### Patch Changes

- [#888](https://github.com/morpho-org/sdks/pull/888) [`be008d6`](https://github.com/morpho-org/sdks/commit/be008d6ba2ad3a158b93b1cd201be8c29e56eef2) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Send the installed `@morpho-org/midnight-sdk` package version with Midnight API requests instead of a hardcoded SDK version.

  Keep the version lookup compatible with both ESM and CommonJS consumers, including through the Midnight API re-export from `@morpho-org/morpho-sdk`.

- [#888](https://github.com/morpho-org/sdks/pull/888) [`be008d6`](https://github.com/morpho-org/sdks/commit/be008d6ba2ad3a158b93b1cd201be8c29e56eef2) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Derive standalone Midnight offer group IDs with the router-compatible singleton group algorithm across trees, mempool validation, and ratifier helpers.

  **Breaking change:** remove the `TreeUtils.buildDescriptor` `preserveStandaloneGroups` option. This escape hatch produced router-incompatible standalone groups and should not have been part of the public API.

## 1.2.0

### Minor Changes

- [#815](https://github.com/morpho-org/sdks/pull/815) [`e7578c3`](https://github.com/morpho-org/sdks/commit/e7578c3c205c3559bf1b7498030d818a0cc04220) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Add `OfferChainUtils.buildLendFixedRateOfferChain`, `buildBorrowFixedRateOfferChain`, and `getMaxFixedRateOfferChainEndTimestamp` so the markets app can build adjacent, grouped offers that keep a maker's displayed fixed rate stable across a long selected window.

  Expose a Midnight accrued position's currently withdrawable credit capacity.

  Align Midnight positions with Blue's model: base positions require `user` and `marketId`, while accrued positions accept `user` plus a hydrated `market` and derive the market id. Retain both identifiers across local accrual so downstream transaction flows can bind snapshots to the correct account and market.

  This position input change intentionally ships in a minor release rather than forcing a major release because `@morpho-org/midnight-sdk` is still young and its public model is being stabilized around secure, owner-bound action flows.

  Move the position model and utilities into a dedicated `position` module matching Blue's source layout while preserving the package's root exports.

  Accept a single Midnight offer or group anywhere tree-shaped input is supported, including `Tree.from`, ratifier helpers, and mempool validation.

## 1.1.1

### Patch Changes

- [#849](https://github.com/morpho-org/sdks/pull/849) [`ca3d727`](https://github.com/morpho-org/sdks/commit/ca3d7276012f37238646f99212ee12416aba2b43) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Harden Midnight SDK API, fetch, offer, group, tree, and package-export behavior for Cantina audit findings.

- Updated dependencies [[`ca3d727`](https://github.com/morpho-org/sdks/commit/ca3d7276012f37238646f99212ee12416aba2b43)]:
  - @morpho-org/morpho-ts@2.8.0

## 1.1.0

### Minor Changes

- [#858](https://github.com/morpho-org/sdks/pull/858) [`bb031a8`](https://github.com/morpho-org/sdks/commit/bb031a83e4ed44d4568da0637a7250c507461b6c) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Add EIP-712 digest and local ratifier-data verification utilities for Ecrecover and Setter payload items.

## 1.0.0

### Major Changes

- [#712](https://github.com/morpho-org/sdks/pull/712) [`93f0c1a`](https://github.com/morpho-org/sdks/commit/93f0c1a2f923d0047c421049f7ffab8f0d66d0c4) Thanks [@0xbulma](https://github.com/0xbulma)! - Add `@morpho-org/midnight-sdk` as a Viem-based package for Morpho Midnight that exports protocol utilities, fetch helpers, and Midnight API utilities under a dedicated `@morpho-org/midnight-sdk/api` subpath.

  The initial surface includes pinned Midnight ABI literals, ABI-compatible market/position/offer values, `MarketParams.from`, `Market.from`, `Offer.create`, `Offer.from`, `Group`, `Group.from`, `Tree`, and `Tree.from` class APIs, object-compatible `MarketUtils`, `OfferUtils`, `GroupUtils`, and `TreeUtils` helpers, tree mempool validation through `Tree.mempoolValidate`, tick and units/assets math helpers, viem-backed fetch helpers with deployless position reads, ratifier classification, Ecrecover/Setter ratifier data codecs, local offer-proof verification, raw mempool payload encoding/decoding, and Midnight public API book/quote/takeable-offer/validation helpers.

  The payload codec rejects non-padding offer bytes unless exactly one of `maxUnits` and `maxAssets` is non-zero.

  The payload codec caps the full framed wire payload at 1,000,000 bytes and derives the compressed item budget after reserving the header and maximum attribution suffix.

  Offers include the protocol `continuousFeeCap` field in SDK types, API mappings, payload encoding/decoding, Merkle leaf hashing, and EIP-712 ratifier typed data so maker signatures match the current Midnight contracts.

  Payload collateral validation mirrors `Midnight.touchMarket` by rejecting zero collateral tokens and liquidation cursors whose computed max LIF violates protocol bounds.

  Payload and market construction reject LLTV values outside the protocol's fixed `[0, WAD]` range while still allowing dynamically configured LLTV tiers inside that range.

  Market hashing canonicalizes non-empty collateral params by token order while preserving raw empty-market hashing for protocol padding.

  `MarketParams` rejects empty collateral lists and duplicate collateral token entries, then normalizes collateral params into onchain token order before offer grouping, tree construction, or signing flows.

  `Market.getCollateralByIndex` and `MarketUtils.getCollateralByIndex` return configured collateral entries and throw `UnknownCollateralIndexError` when an index is unconfigured.

  Offer creation and payload validation reject `expiry` before `start` while allowing zero-duration time ranges that Midnight can take onchain.

  Ecrecover ratification supports direct maker signatures and delegated signer signatures, including mixed-maker trees when the same signer is authorized by every maker onchain.

  Ecrecover ratification accepts a viem client plus explicit signer account, infers a single EIP-712 domain chain id from the offer tree, rejects mixed-chain Ecrecover trees, checks the client is on that chain before signing, and validates client-produced or precomputed signatures against the tree root before producing payload items.

  Ecrecover client signing rejects typed-data signatures that do not recover to the requested signer account.

  `Tree.mempoolValidate` accepts optional ratification inputs so callers can validate final payload bytes with Ecrecover signature data or Setter proof data instead of only validating the pre-ratification tree with empty `ratifierData`.

  `OfferUtils.getConsumableUnits` and `Offer.getConsumableUnits` compute remaining units from hydrated market state plus a caller-provided `consumed` value, with examples inlining the single `Midnight.consumed(maker, group)` read.

  Asset-capped buy-offer consumable units mirror Midnight `take` cap checks by returning the largest unit amount whose rounded-down buyer assets fit within the remaining asset cap.

  Offer creation only accepts protocol-reachable tick spacings and offer groups require a shared cap mode and value, matching Midnight's tick accessibility and group consumption accounting.

  Tick math constants mirror the current Midnight protocol range and price quantum, with `TickLib.tickToApr` plus offer-level price, rate, and APR helpers for simple annualization over a market's time to maturity.

  The package exports `midnightBundlesAbi` for app-compatible Midnight Bundles taker and repay flows, with tuple components aligned to the current Midnight `Market` and `Offer` structs.

  The package consumes shared primitives, `MathLib`, typed errors, and registry data from `@morpho-org/morpho-ts`, and exposes a configurable `MidnightApi` client from `@morpho-org/midnight-sdk/api` with a `https://api.morpho.org/v0/midnight` default, optional string-or-`URL` `baseUrl` override, and parsed quote or takeable-offer payloads that can be passed directly to compatible bundle action inputs.

  `MidnightApi` uses explicit TypeScript interfaces with viem `Address`, `Hash`, and `Hex` primitives for the HTTP boundary; caller inputs are trusted at runtime and forwarded according to those types.

### Minor Changes

- [#824](https://github.com/morpho-org/sdks/pull/824) [`b8d721c`](https://github.com/morpho-org/sdks/commit/b8d721ca0f6701d26fd6a766640fdaf680ec5963) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Sync the SDK with `morpho-org/midnight@55db096af93a8f2bc85bb67f3ccc7b92e1bfab73`.

  Regenerate the pinned Midnight and ratifier ABIs from the updated onchain source. This picks up the configurator rename, enabled LLTV and liquidation cursor getters/setters, new market validation errors, updated ratifier ABI details, and removes the deleted `MidnightBundles` ABI surface.

  Update market params to match the new protocol struct: markets now carry `chainId` and the core `midnight` address, and each collateral uses `liquidationCursor` instead of `maxLif`. These fields are reflected across SDK types, API mappings, payload encoding/decoding, offer structs, EIP-712 typed data, market hashing, Merkle tree padding, fixtures, and documentation examples.

  Update `MarketUtils.toId` to mirror the new `IdLib.toId` behavior by encoding the full market struct and deriving the id with the embedded Midnight address and zero salt. Market hash and offer/tree signature fixtures were refreshed for the new type hashes.

  Mirror the new `Midnight.touchMarket` checks in SDK normalization and payload validation: reject malformed or negative chain ids, too many collaterals, invalid liquidation cursors, computed maximum LIF above `2 WAD`, and non-WAD LLTV values whose computed maximum LIF product exceeds the protocol bound.

### Patch Changes

- [#848](https://github.com/morpho-org/sdks/pull/848) [`8baeac7`](https://github.com/morpho-org/sdks/commit/8baeac71ff62689407b5f9bf2fcb839326de0bcb) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Update Midnight ABI/hash helpers and register Base Midnight deployment addresses.

- Updated dependencies [[`1848eb4`](https://github.com/morpho-org/sdks/commit/1848eb47e794acbf50eedd4a10eb51fee8576a1b), [`830c27e`](https://github.com/morpho-org/sdks/commit/830c27ecfde39d371f406475e3a7edb79ae41da1), [`93f0c1a`](https://github.com/morpho-org/sdks/commit/93f0c1a2f923d0047c421049f7ffab8f0d66d0c4), [`8baeac7`](https://github.com/morpho-org/sdks/commit/8baeac71ff62689407b5f9bf2fcb839326de0bcb)]:
  - @morpho-org/morpho-ts@2.7.0
