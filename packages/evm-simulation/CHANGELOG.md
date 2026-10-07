# @morpho-org/evm-simulation

## 5.0.1

### Patch Changes

- [#1298](https://github.com/morpho-org/sdks/pull/1298) [`e9c3ca8`](https://github.com/morpho-org/sdks/commit/e9c3ca83c150a786ebdd795caed62880c3b47405) Thanks [@0xbulma](https://github.com/0xbulma)! - Fix Monad (chain 143) simulations, which all failed under 5.0.0. Monad nodes reject `eth_simulateV1` with `validation: false` ("not supported yet"), so Monad now sends `validation: true`; its simulated block has base fee 0, so gas is still not charged and native balance movements stay free of gas. Monad's `latest` block is not final: simulating at its number runs on another parent, which failed the pinned-block check, so Monad now pins to `finalized` when no `blockNumber` is given. On Monad, `gasUsed` reports the call's gas limit rather than the gas consumed.

- Updated dependencies [[`1e11c9d`](https://github.com/morpho-org/sdks/commit/1e11c9db3f6dd7f961f777a9129727d8625a1720), [`a3a136d`](https://github.com/morpho-org/sdks/commit/a3a136d8a75ede41a22db0f9aa0ea308767ceba0)]:
  - @morpho-org/morpho-sdk@6.6.0
  - @morpho-org/morpho-ts@3.2.1

## 5.0.0

### Major Changes

- [#1172](https://github.com/morpho-org/sdks/pull/1172) [`c39880f`](https://github.com/morpho-org/sdks/commit/c39880f3d2048eabacbc7e09c7ef42a164d7ba5a) Thanks [@jinmel](https://github.com/jinmel)! - Cut `simulate()` over to the v5 public types and a pinned `eth_simulateV1` boundary.

  BREAKING CHANGES:

  - `SimulateParams` is now an options object with `mode`; `authorizations` are accepted only in `"preview"` and `"pending"` block tags are rejected at runtime. `SimulationAuthorization` is now the union of the five typed variants (`erc20Approval`, `erc2612Permit`, `permit2SignatureTransfer`, `blueAuthorization`, `blueAuthorizationSignature`); the legacy `{type: "approval"}` and `{type: "signature"}` variants are removed.
  - `SimulationTransaction` fields and `SimulateParams` inputs are `readonly`; `simulationTxs` echoes exactly the caller's normalized transactions (`txIdx` in `transfers` and `calls` indexes user transactions).
  - `parseRequest` rejects unknown keys on `SimulateParams`, transactions, authorizations and limits with `SimulationValidationError` (`<path>.<key>: unknown field`); v4 ignored extra properties.
  - `value` transfers are funded by the sender's real native balance (no balance inflation); `validation: false` keeps gas uncharged so gas stays separated from economic effects.
  - `blockNumber` no longer accepts `"pending"`.
  - `InvalidSimulationResponseError` (non-bypassable) replaces `ExternalServiceError` for a malformed `eth_simulateV1` block envelope and a call-count mismatch. New checks that v4 did not perform (it returned success) also throw it: an endpoint whose `eth_chainId` disagrees with the configured chain, a simulated block that is neither the pinned state block nor its immediate successor (with matching `parentHash`), a block timestamp earlier than the pinned block's, a per-call result that fails normalization (non-quantity `gasUsed`, a present but non-array `logs`, or a log whose `topics`/`address`/`data` are malformed), and a pinned state block whose hash changed, or that the node no longer serves, mid-simulation.
  - Node-level code `3`/"insufficient funds" `eth_simulateV1` failures are `SimulationRevertedError`: `details` is a URL-free `{ code, shortMessage }` record for a node-level revert (the viem error rides on `cause`), or the frozen `{ transactionIndex, result }[]` of the user transactions when one of them reverted.

- [#1204](https://github.com/morpho-org/sdks/pull/1204) [`9c97230`](https://github.com/morpho-org/sdks/commit/9c9723081adc91831027204cebc58fdea647db08) Thanks [@jinmel](https://github.com/jinmel)! - Retire the Tenderly RPC backend. `eth_simulateV1` is now the sole simulation backend: there is no provider fallback and `timeoutMs` (default 5000) is the abort budget for the `eth_simulateV1` call.

  **Breaking:** `ChainSimulationConfig` now requires `simulateV1Url` for every configured chain and no longer accepts `tenderlyRpc`; the `TenderlyRpcConfig` type is removed. Migrate by replacing `tenderlyRpc: { rpcUrl }` entries with `simulateV1Url` pointing at a JSON-RPC node that supports `eth_simulateV1`. The unused `zod` runtime dependency is dropped.

- [#1240](https://github.com/morpho-org/sdks/pull/1240) [`347c115`](https://github.com/morpho-org/sdks/commit/347c115f3c2c5cac825a827e2aed58373c2b443a) Thanks [@jinmel](https://github.com/jinmel)! - Add optional caller-supplied slippage checks to the v5 simulation pipeline. Each action/subject entry supplies a quote (assets received/paid or shares minted/burned) and a WAD-scaled percentage tolerance. No calldata is decoded and no quotes or tolerances are inferred or defaulted. Results identify the quote and tolerance checked over the whole bundle. Remove separate penalty and refund checks.

  Replace the single asset override with separate `assetPaid` and `assetReceived` fields so each leg of a two-asset operation can use its own token.

  Keep SDK requirements conversion and preview preparation, without authorization-policy or permission/nonce read-back checks. Preparation and user transaction reverts propagate. Preview success applies to simulated permissions, not future signatures.

  Replace the earlier unreleased per-action limits and default-policy constants with SlippageLimits. Remove transaction indices from bundle-wide limit observations. See the v4-to-v5 migration guide for the input and result changes.

  Remove the unreleased broad state snapshots/diffs and their public types. Plan only reads required by quotes: ERC-20 balances and Blue position shares, with native amounts taken from transfer traces. Remove vault/market reporting, factory discovery, full entity fetching, and the interest-accrual model. Omitted limits produce no slippage reads. Existing transfer reporting and retention checks remain unchanged.

- [#1168](https://github.com/morpho-org/sdks/pull/1168) [`02bf56d`](https://github.com/morpho-org/sdks/commit/02bf56d60e6fea5eb7bc304935e1a2eefb56a111) Thanks [@jinmel](https://github.com/jinmel)! - Add typed error classes for simulation verification (`UnsupportedOperationError`, `InvalidSimulationResponseError`, `MissingVerificationEvidenceError`, `AuthorizationRequestMismatchError`, `ConsumerLimitViolationError`, `UnexpectedSimulationError`), each extending `SimulationPackageError` directly and accepting an optional frozen `SimulationErrorContext`, as do the existing errors.

  Export the simulation error contract: `SIMULATION_ERROR_CODES` / `SimulationErrorCode`, `SimulationErrorContext` (readonly union of the per-stage `SimulationValidationContext`, `SimulationPreparationContext`, `SimulationExecutionContext`, `SimulationVerificationContext` and `SimulationTransportContext`, every stage carrying `mode`, `chainId` and `blockNumber`; verification contexts bound to a limit keyed by `operation`, which fixes the subject fields — `marketId`, `sourceMarketId`/`targetMarketId`, `vault`, `sourceVault`/`targetVault`; unbound verification contexts carry only a `field` string, and caller-transaction or node reverts carry no context), `SimulationStage`, `BLUE_MARKET_OPERATION_TYPES` / `BlueMarketOperationType`, `VAULT_OPERATION_TYPES` / `VaultOperationType`, `SimulationOperationSubject` with its members `BlueMarketOperationSubject`, `BlueRefinanceSubject`, `VaultOperationSubject`, `VaultV1MigrateToV2Subject` (the operation-keyed subject union shared with simulation error contexts), `SimulationExecutionReason`, `isSimulationPackageError` (structural guard narrowing to `SimulationPackageError`; plain objects must carry the class `name` owning their `code`), `RetainedAsset`, `SIMULATION_MODES` / `SimulationMode` and `OPERATION_TYPES` / `OperationType`.

  `SimulationRevertedError.reasonCode: SimulationExecutionReason` is the machine-readable cause of an execution failure (defaults to `"UNKNOWN_REVERT"`); `reason` stays a human-readable message that consumers must not parse.

  `SimulationRevertedError` carries a structured `details` payload.

  **Breaking:** `BlacklistViolationError.assetChanges` entries are `{ address: Address; token: Address; netRetained: bigint }` (previously optional string addresses and a decimal-string amount). `SimulationPackageError.code` is typed as `SimulationErrorCode` and the base class declares `readonly context?: SimulationErrorContext`. Built-in errors now declare a literal `name` class field paired with their `code`, so a subclass of a built-in error (e.g. `class MyError extends SimulationValidationError`) reports the built-in `name` rather than its own (previously `this.constructor.name`). Direct subclasses of `SimulationPackageError` still get `new.target.name`. Only literal name/code pairs are recognized by `isSimulationPackageError` on plain objects. `SimulateParams` is now the v5 input (`chainId`, `transactions`, `mode?: SimulationMode`, `authorizations?: SimulationAuthorization[]`, `blockNumber?`, `limits?: SimulationLimits`); the pre-v5 shape is no longer exported. `SimulationAuthorization`, `SimulationLimits`, `OperationLimit`, `VerifiedSimulationResult`, `SimulationVerification` and their member types are exported from the package root.

  Migrate by passing the v5 `SimulateParams` shape to `simulate()` (see `docs/migrations/evm-simulation-v4-to-v5.md`); use `netRetained.toString()` where a decimal string is still needed and drop `undefined` checks on `assetChanges[].address` / `.token`.

### Minor Changes

- [#1174](https://github.com/morpho-org/sdks/pull/1174) [`8e2b8fb`](https://github.com/morpho-org/sdks/commit/8e2b8fb66ebe8f0d41f826012147613edb3fc42d) Thanks [@jinmel](https://github.com/jinmel)! - Add `toSimulationAuthorizations({ chainId, mode, blockNumber, owner, requirements })`, a pure adapter that maps morpho-sdk `ActionRequirement[]` (from `ActionOutput.getRequirements()`) onto ordered `SimulationAuthorization[]` descriptors — no validation lives in the adapter; `simulate()`'s request parser validates each authorization's shape and semantics. ERC-20 approval and Blue authorization call requirements map `action.args` (the approval token is the requirement's `to`); `permit`, `permit2SignatureTransfer`, and `authorization` signature requirements pass their EIP-712 payload through unchanged. A signature requirement without `typedData` or an unknown requirement type throws a typed error (`AuthorizationRequestMismatchError` / `UnsupportedOperationError`).

### Patch Changes

- Updated dependencies [[`a6911ee`](https://github.com/morpho-org/sdks/commit/a6911ee1cd598d5f3c9bbf694f78c4e441c0ccb6)]:
  - @morpho-org/morpho-sdk@6.5.0

## 4.2.1

### Patch Changes

- [#1111](https://github.com/morpho-org/sdks/pull/1111) [`cb863fd`](https://github.com/morpho-org/sdks/commit/cb863fd37b02af080dd26aa9701568d1aa913723) Thanks [@jinmel](https://github.com/jinmel)! - Add `RateRatifierV1Utils` and `PriceRatifierV1Utils` (leaf hashing, Merkle trees, ratifier data encoding/verification, rate price bounds, `setIsRootRatified` encoders), `priceRatifierV1Abi`/`rateRatifierV1Abi`, and V1 offer typehash constants. Add `TreeUtils.buildRootFromLeaves`/`verifyLeafProof` and the `MAX_TREE_HEIGHT` constant. Caller-provided V1 tree descriptors are fully re-validated before use, and negative rate/time bounds throw `InvalidRateRatifierV1RateError`/`InvalidRateRatifierV1TimeError`; sub-MIN_TICK rate leaves throw `InvalidRateRatifierV1TickError`, zero ratifier addresses throw `InvalidRatifierV1AddressError`, and disallowed takers throw `RatifierV1TakerNotAllowedError`. Add `TreeUtils.normalizeEntries`; `TreeUtils.mempoolValidate` and `Tree.from` also accept route-typed and V1 tree snapshots. Add `priceRatifierV1` and `rateRatifierV1` keys to `ChainAddresses` with Ethereum, Base, Arc and Robinhood mainnet registry entries, and expose the new Midnight symbols through the `morpho-sdk` facade. `mempoolValidate` on priceV1/rateV1 trees always encodes real V1 ratifier data, since the router decodes it to identify each offer. Snapshot descriptors whose padding exceeds `2**height` now throw `InvalidTreeError`, and `RateRatifierV1.priceBound` throws `RateRatifierV1BoundOverflowError` when bound arithmetic overflows uint256, matching the contract's checked math.

- Updated dependencies [[`cb863fd`](https://github.com/morpho-org/sdks/commit/cb863fd37b02af080dd26aa9701568d1aa913723), [`5894246`](https://github.com/morpho-org/sdks/commit/5894246106cab21e635848d82720ad080bf2b8d5)]:
  - @morpho-org/morpho-ts@3.1.0
  - @morpho-org/blue-sdk@7.1.0

## 4.2.0

### Minor Changes

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

- [#1128](https://github.com/morpho-org/sdks/pull/1128) [`1d32278`](https://github.com/morpho-org/sdks/commit/1d322787b8ca26d7012835e69e0730ec78e7a97d) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Guard `MidnightBundlesV1` with the simulation retention check so bundles that leave token value on the transient router fail closed with `BlacklistViolationError`.

- [#1123](https://github.com/morpho-org/sdks/pull/1123) [`35f6ea6`](https://github.com/morpho-org/sdks/commit/35f6ea603c7aecff3d4d962c098bddaa80cb1985) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - `parseTransfers` now lowercases log `topics` and `data` before signature dispatch and WETH9 pair matching, so mixed-case hex from a backend can no longer drop a transfer from the parsed output or the retention check.

- Updated dependencies [[`800f2e1`](https://github.com/morpho-org/sdks/commit/800f2e1f0523de39fe9055b2f077ebf5f72e5d57), [`a8167e7`](https://github.com/morpho-org/sdks/commit/a8167e7505cc6ca1baa789e239e0f944d5a6e47c), [`0e72b04`](https://github.com/morpho-org/sdks/commit/0e72b0439aa46c7a7d6b4e6fad6d2d9c79c2e45e), [`468422d`](https://github.com/morpho-org/sdks/commit/468422d90019029b3d18ac239bf6fbb19748c22e)]:
  - @morpho-org/morpho-ts@3.0.0
  - @morpho-org/blue-sdk@7.0.0

## 4.2.0-next.2

### Patch Changes

- [#1128](https://github.com/morpho-org/sdks/pull/1128) [`1d32278`](https://github.com/morpho-org/sdks/commit/1d322787b8ca26d7012835e69e0730ec78e7a97d) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Guard `MidnightBundlesV1` with the simulation retention check so bundles that leave token value on the transient router fail closed with `BlacklistViolationError`.

- [#1123](https://github.com/morpho-org/sdks/pull/1123) [`35f6ea6`](https://github.com/morpho-org/sdks/commit/35f6ea603c7aecff3d4d962c098bddaa80cb1985) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - `parseTransfers` now lowercases log `topics` and `data` before signature dispatch and WETH9 pair matching, so mixed-case hex from a backend can no longer drop a transfer from the parsed output or the retention check.

- Updated dependencies [[`800f2e1`](https://github.com/morpho-org/sdks/commit/800f2e1f0523de39fe9055b2f077ebf5f72e5d57), [`a8167e7`](https://github.com/morpho-org/sdks/commit/a8167e7505cc6ca1baa789e239e0f944d5a6e47c), [`468422d`](https://github.com/morpho-org/sdks/commit/468422d90019029b3d18ac239bf6fbb19748c22e)]:
  - @morpho-org/morpho-ts@3.0.0-next.1
  - @morpho-org/blue-sdk@7.0.0-next.2

## 4.2.0-next.1

### Minor Changes

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

## 4.1.9-next.0

### Patch Changes

- [#1078](https://github.com/morpho-org/sdks/pull/1078) [`d3b43f3`](https://github.com/morpho-org/sdks/commit/d3b43f36464ee09d985e327037d4ca0f321f36c1) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Fail closed when positive debt requires an unsupported nonzero interest-rate model, while preserving exact zero-interest and zero-exposure calculations.

  Treat accrual timestamps at or before a Blue market or Vault V2 snapshot's last update as a no-op: preserve its state and timestamp without projecting its IRM or charging new fees. Positions and Vault V1 allocations inherit the market behavior, while Vault V1 retains its existing loss and fee reconciliation. Rate and APY helpers evaluate earlier timestamps at the snapshot's last update.

  Skip Vault V1 sources with zero allocator withdrawal capacity and Vault V1/V2 destinations with no remaining deposit capacity before projecting source interest.

  Check Vault V2 minimum share minting requirements, supply-share limits, and every target absolute or zero relative cap before source projection when the candidate withdrawal cannot reduce that cap. Preserve shared-cap withdrawals and deposits whose allocation does not increase after rounding.

- Updated dependencies [[`d3b43f3`](https://github.com/morpho-org/sdks/commit/d3b43f36464ee09d985e327037d4ca0f321f36c1)]:
  - @morpho-org/blue-sdk@6.10.0-next.0

## 4.1.6-next.0

### Patch Changes

- [#1056](https://github.com/morpho-org/sdks/pull/1056) [`c4b4467`](https://github.com/morpho-org/sdks/commit/c4b44677e7a6881072eca0fe5eba54c3d9761b60) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Extend the simulation retention check to also guard the standalone `bundles` periphery contracts (`VaultExitBundlesV1`, `VaultBundlesV1`, `BlueBundlesV1`) from the blue-sdk address registry, alongside the existing `bundler3` executor and adapters. Net `(address, token)` retention above `DUST_THRESHOLD` in any of these restricted contracts now raises `BlacklistViolationError`. Chains are skipped only when blue-sdk catalogs neither a `bundler3` nor a `bundles` config.

- [#1056](https://github.com/morpho-org/sdks/pull/1056) [`c4b4467`](https://github.com/morpho-org/sdks/commit/c4b44677e7a6881072eca0fe5eba54c3d9761b60) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Normalize the native-ETH sentinel case-insensitively when mapping Tenderly asset changes. A sentinel carried (checksummed or otherwise non-lowercase) in `assetInfo.contractAddress` was previously `getAddress`-checksummed and no longer matched the lowercase `ethAddress` key used by `assertNoBundlerRetention`, so a retained Bundler3 native residual could escape the retention gate and return a false-safe simulation. The transfer-log parser and the Tenderly asset-change mapper now share a single `normalizeAssetToken` helper, removing the drift between the two normalization paths.

- [#1056](https://github.com/morpho-org/sdks/pull/1056) [`c4b4467`](https://github.com/morpho-org/sdks/commit/c4b44677e7a6881072eca0fe5eba54c3d9761b60) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Use chain registry metadata when parsing WETH9 `Deposit` and `Withdrawal` logs: accept only the registered wrapped-native token, reject them on known tokenless chains, and retain legacy signature-based parsing on unknown custom chains.

## 4.1.10

### Patch Changes

- [#1102](https://github.com/morpho-org/sdks/pull/1102) [`d98eca5`](https://github.com/morpho-org/sdks/commit/d98eca535fdbf389b2a77e2d42f1dd10cb78139e) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Register the Robinhood Chain (chain 4663) Midnight deployments from morpho-org/deployments
  address-book.json: `midnight`, `midnightBundles`, `midnightBlueBuyCallbackFactory`, `midnightMempool`,
  `ecrecoverRatifier`, `ecrecoverAuthorizer`, `setterRatifier`, each with its deployment block in the
  registry. `getChainAddress(ChainId.RobinhoodMainnet, ...)` now resolves these labels, so the Midnight
  SDK works on Robinhood Chain. Addresses are sourced byte-for-byte from the canonical deployment
  registry; deployment blocks were derived from the deployer contract creation receipts on Robinhood
  Chain.
- Updated dependencies [[`d98eca5`](https://github.com/morpho-org/sdks/commit/d98eca535fdbf389b2a77e2d42f1dd10cb78139e)]:
  - @morpho-org/morpho-ts@2.15.0
  - @morpho-org/blue-sdk@6.11.0

## 4.1.9

### Patch Changes

- [#1088](https://github.com/morpho-org/sdks/pull/1088) [`2e899af`](https://github.com/morpho-org/sdks/commit/2e899af4063a70d37b2b48270dba85b4231d6cca) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Register the canonical `VaultExitBundlesV1`, `VaultBundlesV1`, and `BlueBundlesV1` deployments in the
  `bundles` group of `ChainAddresses` for Arc (chain 5042), matching the layout already exposed on the
  other supported chains. `getChainAddress(ChainId.ArcMainnet, "bundles.vaultExitBundlesV1")`,
  `getChainAddress(ChainId.ArcMainnet, "bundles.vaultBundlesV1")`, and
  `getChainAddress(ChainId.ArcMainnet, "bundles.blueBundlesV1")` now resolve the new entries, and the
  deployment-block registry records the `VaultExitBundlesV1` creation block. Addresses are sourced
  byte-for-byte from the canonical deployment registry (morpho-org/deployments address-book.json).

- [#1092](https://github.com/morpho-org/sdks/pull/1092) [`ab6d1b9`](https://github.com/morpho-org/sdks/commit/ab6d1b9760debb944dcb4a24ce327e359528fee8) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Register the remaining Arc (chain 5042) deployments from morpho-org/deployments address-book.json:
  the Vault V2 `BluePublicAllocator` (`vaultV2BluePublicAllocator`) and the full Midnight stack
  (`midnight`, `midnightBundles`, `midnightBlueBuyCallbackFactory`, `midnightMempool`,
  `ecrecoverRatifier`, `ecrecoverAuthorizer`, `setterRatifier`), each with its deployment block in the
  registry. `getChainAddress(ChainId.ArcMainnet, ...)` now resolves these labels, so Blue public
  allocations and the Midnight SDK work on Arc. Addresses are sourced byte-for-byte from the canonical
  deployment registry; deployment blocks were derived from the Arc archive node.
- Updated dependencies [[`2e899af`](https://github.com/morpho-org/sdks/commit/2e899af4063a70d37b2b48270dba85b4231d6cca), [`ab6d1b9`](https://github.com/morpho-org/sdks/commit/ab6d1b9760debb944dcb4a24ce327e359528fee8)]:
  - @morpho-org/morpho-ts@2.14.0
  - @morpho-org/blue-sdk@6.10.0

## 4.1.8

### Patch Changes

- [#1080](https://github.com/morpho-org/sdks/pull/1080) [`616b457`](https://github.com/morpho-org/sdks/commit/616b4578edd3509ff3cf4e666f958f16e3bcdcab) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Deprecate all Vault V1 PublicAllocator surfaces, including raw ABIs, address and deployment registry fields, configuration models, fetchers, augmentation methods, and the liquidity loader. The existing V1 planning and transaction-composition deprecations continue to apply. Use Vault V2 BluePublicAllocator configurations and fetchers, `MorphoBlue.getVaultV2BlueReallocationData`, and `MorphoBlue.getVaultV2BlueReallocations` for new integrations.

  Deprecate the legacy `morphoToken` address and the MORPHO legacy wrapping entries in `ethereumGeneralAdapter1Abi`. Use the current MORPHO token directly.

  All deprecated exports, signatures, addresses, and transaction behavior remain available for compatibility until the next major release. General Vault V1 operations, Vault V2 allocator APIs, and other token wrapping flows remain supported.

  Patch maintained runtime dependents so their next releases resolve the updated packages. Existing internal peer ranges accept these backward-compatible minor releases and require no changes.

- [#1025](https://github.com/morpho-org/sdks/pull/1025) [`297e948`](https://github.com/morpho-org/sdks/commit/297e94823b86359d4bbeda2d70dd79abac0c1a8a) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Fail closed when positive debt requires an unsupported nonzero interest-rate model, while preserving exact zero-interest and zero-exposure calculations.

  Treat accrual timestamps at or before a Blue market or Vault V2 snapshot's last update as a no-op: preserve its state and timestamp without projecting its IRM or charging new fees. Positions and Vault V1 allocations inherit the market behavior, while Vault V1 retains its existing loss and fee reconciliation. Rate and APY helpers evaluate earlier timestamps at the snapshot's last update.

  Skip Vault V1 sources with zero allocator withdrawal capacity and Vault V1/V2 destinations with no remaining deposit capacity before projecting source interest.

  Check Vault V2 minimum share minting requirements, supply-share limits, and every target absolute or zero relative cap before source projection when the candidate withdrawal cannot reduce that cap. Preserve shared-cap withdrawals and deposits whose allocation does not increase after rounding.

- Updated dependencies [[`616b457`](https://github.com/morpho-org/sdks/commit/616b4578edd3509ff3cf4e666f958f16e3bcdcab), [`297e948`](https://github.com/morpho-org/sdks/commit/297e94823b86359d4bbeda2d70dd79abac0c1a8a)]:
  - @morpho-org/blue-sdk@6.9.0
  - @morpho-org/morpho-ts@2.13.0

## 4.1.7

### Patch Changes

- [#1063](https://github.com/morpho-org/sdks/pull/1063) [`ebaba84`](https://github.com/morpho-org/sdks/commit/ebaba84e28832c2d1935c9f21ab3b37d037b18dd) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Add the canonical Permit2 contract address (`0x000000000022D473030F116dDEE9F6B43aC78BA3`) to the Monad (chain id 143) and Stable (chain id 988) entries in the shared address registry, enabling Permit2 approval flows (Bundler3 and Midnight periphery) on both chains.

  Patch maintained packages with direct runtime dependencies on `@morpho-org/morpho-ts` so their latest releases resolve the new registry entries.

- Updated dependencies [[`ebaba84`](https://github.com/morpho-org/sdks/commit/ebaba84e28832c2d1935c9f21ab3b37d037b18dd)]:
  - @morpho-org/morpho-ts@2.12.0

## 4.1.6

### Patch Changes

- [#1010](https://github.com/morpho-org/sdks/pull/1010) [`000d92b`](https://github.com/morpho-org/sdks/commit/000d92bc88f6b9370d16dcc3069ffd81fbd85fe8) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Extend the simulation retention check to also guard the standalone `bundles` periphery contracts (`VaultExitBundlesV1`, `VaultBundlesV1`, `BlueBundlesV1`) from the blue-sdk address registry, alongside the existing `bundler3` executor and adapters. Net `(address, token)` retention above `DUST_THRESHOLD` in any of these restricted contracts now raises `BlacklistViolationError`. Chains are skipped only when blue-sdk catalogs neither a `bundler3` nor a `bundles` config.

- [#1005](https://github.com/morpho-org/sdks/pull/1005) [`890d2e3`](https://github.com/morpho-org/sdks/commit/890d2e33855e04d51e93b2133455d68dfc78455f) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Normalize the native-ETH sentinel case-insensitively when mapping Tenderly asset changes. A sentinel carried (checksummed or otherwise non-lowercase) in `assetInfo.contractAddress` was previously `getAddress`-checksummed and no longer matched the lowercase `ethAddress` key used by `assertNoBundlerRetention`, so a retained Bundler3 native residual could escape the retention gate and return a false-safe simulation. The transfer-log parser and the Tenderly asset-change mapper now share a single `normalizeAssetToken` helper, removing the drift between the two normalization paths.

- [#1029](https://github.com/morpho-org/sdks/pull/1029) [`9decd4b`](https://github.com/morpho-org/sdks/commit/9decd4b7da0867c01a9240fd0c7658739490b6f2) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Use chain registry metadata when parsing WETH9 `Deposit` and `Withdrawal` logs: accept only the registered wrapped-native token, reject them on known tokenless chains, and retain legacy signature-based parsing on unknown custom chains.

- [#1050](https://github.com/morpho-org/sdks/pull/1050) [`28f49d7`](https://github.com/morpho-org/sdks/commit/28f49d7da6ebd9c86669d06b03a43044fdffaade) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Map a node-level viem `ExecutionRevertedError` thrown by `eth_simulateV1` to `SimulationRevertedError` instead of `ExternalServiceError`, so a reverting bundle is never classified as a fallback-eligible service failure.

- Updated dependencies [[`5e09aa2`](https://github.com/morpho-org/sdks/commit/5e09aa2c2bb091c9ace4a5bda200e2ca520227b2), [`0a3e9a3`](https://github.com/morpho-org/sdks/commit/0a3e9a32b184164ed774d6aae35868987e622597), [`6ad775f`](https://github.com/morpho-org/sdks/commit/6ad775fc794b1b164fef5defaf10f2d32a889fd1)]:
  - @morpho-org/morpho-ts@2.11.2
  - @morpho-org/blue-sdk@6.8.0

## 4.1.5

### Patch Changes

- [#953](https://github.com/morpho-org/sdks/pull/953) [`17f430b`](https://github.com/morpho-org/sdks/commit/17f430b15c25c50129ff461a7315a7e1acaa64b1) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Register the canonical `VaultBundlesV1` and `BlueBundlesV1` deployments in the `bundles` group of
  `ChainAddresses`, alongside the existing `bundles.vaultExitBundlesV1` entry. The `AddressLabel`
  union gains `bundles.vaultBundlesV1` and `bundles.blueBundlesV1`, so
  `getChainAddress(chainId, "bundles.vaultBundlesV1")`,
  `getChainAddress(chainId, "bundles.blueBundlesV1")`, and `registerCustomAddresses` resolve the new
  entries like any other registry address. Both fields are optional so chains that only expose
  `vaultExitBundlesV1` remain valid.

  Addresses are sourced from the canonical deployment registry
  (`morpho-org/deployments` `address-book.json`) and cover Ethereum, Base, Arbitrum, Optimism,
  Polygon, World Chain, Unichain, HyperEVM, Katana, Monad, Stable, Tempo, and Robinhood Chain — the
  same thirteen chains that already register `VaultExitBundlesV1`.

  Patch maintained packages with direct runtime dependencies on `@morpho-org/morpho-ts` so their
  latest releases resolve the new registry entries.

- Updated dependencies [[`17f430b`](https://github.com/morpho-org/sdks/commit/17f430b15c25c50129ff461a7315a7e1acaa64b1)]:
  - @morpho-org/morpho-ts@2.11.0
  - @morpho-org/blue-sdk@6.7.0

## 4.1.4

### Patch Changes

- [#936](https://github.com/morpho-org/sdks/pull/936) [`cde4052`](https://github.com/morpho-org/sdks/commit/cde4052c5f72e8345aae1b4ae863290e7c5b7f66) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Synchronize maintained chain address and deployment-block registries with the current deployments repository.

- Updated dependencies [[`402175b`](https://github.com/morpho-org/sdks/commit/402175b32cc37e0da9e7b33495080a695941fa71), [`cde4052`](https://github.com/morpho-org/sdks/commit/cde4052c5f72e8345aae1b4ae863290e7c5b7f66)]:
  - @morpho-org/morpho-ts@2.10.0
  - @morpho-org/blue-sdk@6.6.0

## 4.1.3

### Patch Changes

- [#910](https://github.com/morpho-org/sdks/pull/910) [`61eb721`](https://github.com/morpho-org/sdks/commit/61eb721a5e112d164df40dfa501acd7929407914) Thanks [@devin-ai-integration](https://github.com/apps/devin-ai-integration)! - Document `gasUsed` semantics and per-call propagation without changing behavior.

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

- Updated dependencies [[`2c76ea5`](https://github.com/morpho-org/sdks/commit/2c76ea50ee1f29d2c3a5a74f9bddd9e34910378a)]:
  - @morpho-org/morpho-ts@2.9.0
  - @morpho-org/blue-sdk@6.5.0

## 4.1.2

### Patch Changes

- [#865](https://github.com/morpho-org/sdks/pull/865) [`2aeb19d`](https://github.com/morpho-org/sdks/commit/2aeb19ddf2e727ed544e47416660b06b14b57e1c) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - fix(evm-simulation): detect native ETH retained by bundler3 on the Tenderly backend

  `assertNoBundlerRetention` only inspected parsed `Transfer` logs, so native ETH
  retained by a bundler3 address slipped through the guard on the Tenderly primary
  backend — native ETH emits no event log, and Tenderly derives it into
  `assetChanges` rather than synthetic transfer logs (Cantina finding 1440).

  The retention check now also reads native ETH from `assetChanges` (the
  cross-backend source of truth), while ERC20/WETH retention keeps coming from
  transfer logs. Native transfer logs (the `eth_simulateV1` synthetic sentinel)
  are only used as a fallback for bundler addresses absent from `assetChanges`, so
  native moves are never double-counted on `eth_simulateV1`.

## 4.1.1

### Patch Changes

- [#862](https://github.com/morpho-org/sdks/pull/862) [`5a39d63`](https://github.com/morpho-org/sdks/commit/5a39d6314afb5a8a236242090ec3c40623aebf57) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Fix published CJS/ESM package entrypoint metadata so legacy main/type resolution and conditional exports point at built files.

- Updated dependencies [[`5a39d63`](https://github.com/morpho-org/sdks/commit/5a39d6314afb5a8a236242090ec3c40623aebf57)]:
  - @morpho-org/blue-sdk@6.3.1

## 4.1.0

### Minor Changes

- [#803](https://github.com/morpho-org/sdks/pull/803) [`7157a55`](https://github.com/morpho-org/sdks/commit/7157a5526af51fe7fc817f39e2cc4a799b3ae483) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Enable `traceTransfers` on the `eth_simulateV1` backend so native-ETH moves — including ETH moved through internal calls (e.g. a `WETH.withdraw` refund) — are captured in `assetChanges`. The node synthesizes native transfers as `Transfer` logs from the native sentinel, which `parseTransfers` normalizes to viem's `ethAddress`. Native ETH is now derived entirely from these logs instead of the top-level transaction `value`, closing the prior coverage gap where the `eth_simulateV1` path missed internally-moved ETH (Tenderly already reported it). Both backends now report the full net native-ETH delta.

  The sender ETH balance override now uses half of `uint256` instead of the `uint256` ceiling, leaving headroom for inbound native ETH. Pinning the sender at `maxUint256` overflowed the recipient balance whenever the simulated calls paid native ETH back to the sender (e.g. a `WETH.withdraw` refund), reverting the value transfer.

### Patch Changes

- [#841](https://github.com/morpho-org/sdks/pull/841) [`1848eb4`](https://github.com/morpho-org/sdks/commit/1848eb47e794acbf50eedd4a10eb51fee8576a1b) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Add Robinhood Chain (chain id 4663) to the shared chain and address registries.

  Register the `ChainId.RobinhoodMainnet` enum member, its explorer/native-currency metadata, and its era-2 Morpho Blue, AdaptiveCurveIrm, Bundler3, VaultV2, adapter-factory, registry, oracle-factory, pre-liquidation-factory, and wrapped-native addresses (sourced from the `morpho-org/deployments` address book).

  Patch maintained packages with direct runtime dependencies on `@morpho-org/morpho-ts` so their latest releases resolve the new registry entry.

- [#828](https://github.com/morpho-org/sdks/pull/828) [`830c27e`](https://github.com/morpho-org/sdks/commit/830c27ecfde39d371f406475e3a7edb79ae41da1) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Add World Chain USDC with permit version 2 support to the shared address registry.

  Normalize fallback Circle permit token address checks so known USDC/EURC addresses use permit domain version `"2"` regardless of caller-provided address casing.

  Patch maintained packages with direct runtime dependencies on `@morpho-org/morpho-ts` so their latest releases resolve the new registry entry.

- [#712](https://github.com/morpho-org/sdks/pull/712) [`93f0c1a`](https://github.com/morpho-org/sdks/commit/93f0c1a2f923d0047c421049f7ffab8f0d66d0c4) Thanks [@0xbulma](https://github.com/0xbulma)! - Move shared Blue and Midnight SDK primitives to `@morpho-org/morpho-ts`: chain metadata, address/deployment registries, fixed-point math helpers, shared bigint types, typed registry/math errors, `ORACLE_PRICE_SCALE`, `assertNonNegative`, and `_try`.

  Expose shared ABI literals through `@morpho-org/morpho-ts/abis` so root utility imports do not load the ABI table.

  Model addresses as a unified flat Morpho registry so Blue and Midnight addresses live on the same chain entry and resolve through the protocol-agnostic `getChainAddresses`, `getChainAddress`, and `registerCustomAddresses` helpers.

  Keep `@morpho-org/blue-sdk` compatible by re-exporting the extracted chain, address, math, `_try`, and error surfaces from `@morpho-org/morpho-ts`, and remove the now-unused lodash registry merge dependencies from `@morpho-org/blue-sdk`.

  Expose the shared address registry helpers and registry types through `@morpho-org/morpho-sdk` so integrators can import the cross-protocol address surface from the main SDK package.

  Update maintained dependents of `@morpho-org/blue-sdk` and `@morpho-org/morpho-ts`, including peer dependents, so published packages resolve the extracted shared primitives used by the Blue SDK compatibility layer.

- [#848](https://github.com/morpho-org/sdks/pull/848) [`8baeac7`](https://github.com/morpho-org/sdks/commit/8baeac71ff62689407b5f9bf2fcb839326de0bcb) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Update Midnight ABI/hash helpers and register Base Midnight deployment addresses.

- Updated dependencies [[`1848eb4`](https://github.com/morpho-org/sdks/commit/1848eb47e794acbf50eedd4a10eb51fee8576a1b), [`830c27e`](https://github.com/morpho-org/sdks/commit/830c27ecfde39d371f406475e3a7edb79ae41da1), [`93f0c1a`](https://github.com/morpho-org/sdks/commit/93f0c1a2f923d0047c421049f7ffab8f0d66d0c4), [`8baeac7`](https://github.com/morpho-org/sdks/commit/8baeac71ff62689407b5f9bf2fcb839326de0bcb)]:
  - @morpho-org/morpho-ts@2.7.0
  - @morpho-org/blue-sdk@6.3.0

## 4.0.1

### Patch Changes

- [#752](https://github.com/morpho-org/sdks/pull/752) [`229fa2e`](https://github.com/morpho-org/sdks/commit/229fa2ed33e2a55fc597dca96220ec4666fc481c) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Add Morph and MegaETH chain metadata, deployment addresses, deployment block lower bounds, and wrapped-native mappings.

  Patch maintained packages that depend directly on `@morpho-org/blue-sdk` so their latest releases resolve the new address registry.

- [#792](https://github.com/morpho-org/sdks/pull/792) [`bbec0e8`](https://github.com/morpho-org/sdks/commit/bbec0e8a8784dd8438ec510cd7f79c4f91386c81) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Warn, but do not block, when a simulated bundle sweeps a pre-existing bundler balance.

- Updated dependencies [[`229fa2e`](https://github.com/morpho-org/sdks/commit/229fa2ed33e2a55fc597dca96220ec4666fc481c), [`fab0186`](https://github.com/morpho-org/sdks/commit/fab018666faef372a7f695edcd4b54e658f73118)]:
  - @morpho-org/blue-sdk@6.2.0

## 4.0.0

### Major Changes

- [#764](https://github.com/morpho-org/sdks/pull/764) [`c3d62ba`](https://github.com/morpho-org/sdks/commit/c3d62ba42f87e1930f721c1ce91a98944288f2f5) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Harmonize `assetChanges` across both simulation backends into a single canonical
  shape, exposed as `SimulationResult.assetChanges`.

  - New exported types: `AssetChange` (`{ token, symbol?, decimals?, diff }`, a
    single asset's net delta; native ETH uses viem's `ethAddress` sentinel as
    `token`) and `AccountAssetChanges` (`{ account, changes }`). `assetChanges` is
    now the net per-token balance change **grouped by account** over the whole
    bundle — the sender and every counterparty (the zero address is kept for
    mints/burns), sorted by address for deterministic, cross-backend output.
  - `eth_simulateV1` derives `assetChanges` from the emitted transfer logs plus
    native ETH from each transaction's top-level `value` (payer debited, recipient
    credited, under `ethAddress`); previously `assetChanges` was Tenderly-only and
    lost on the fallback path. Native ETH moved through internal calls (e.g. a
    `WETH.withdraw` refund) emits no log and is not captured on the fallback path —
    use Tenderly for full native-ETH accounting.
  - Tenderly's per-transfer `assetChanges` payload is now schema-validated and
    reduced to the same `AccountAssetChanges[]`.

  **Breaking:** the opaque per-call `SimulationCall.assetChanges?: unknown` field is
  removed. Read the bundle-level `SimulationResult.assetChanges` instead.

## 3.0.0

### Major Changes

- [#754](https://github.com/morpho-org/sdks/pull/754) [`e17a050`](https://github.com/morpho-org/sdks/commit/e17a0507ceaa348ec23e4f6884441723c080a7bf) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Remove the address screening surface. The `screenAddresses` function, the `AddressScreeningError` class, and the bundled static sanctioned-addresses list are no longer exported. Callers that need compliance screening should run it externally on the `simulationTxs` and `transfers` returned by `simulate()`.

- [#756](https://github.com/morpho-org/sdks/pull/756) [`ea25f7f`](https://github.com/morpho-org/sdks/commit/ea25f7fcad8f82bb59a7ab0edbc2867ebb908aaf) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Replace the Tenderly REST API backend with the Tenderly Node RPC
  (`tenderly_simulateTransaction` and `tenderly_simulateBundle`).

  - `TenderlyRestConfig` is removed; use `TenderlyRpcConfig` (`{ rpcUrl }`)
    embedded per-chain in `ChainSimulationConfig`. The chain-level type is now
    a discriminated union enforcing at least one of `tenderlyRpc` (primary) or
    `simulateV1Url` (fallback).
  - `SimulationConfig.tenderlyRest` (and its `supportedChainIds`) is removed —
    Tenderly support is declared per chain.
  - The `shareable` option on `simulate()` and the `tenderlyUrl` field on
    `SimulationResult` are removed; Tenderly Node RPC has no persistence /
    shareable-URL concept.

### Patch Changes

- [#746](https://github.com/morpho-org/sdks/pull/746) [`401cf32`](https://github.com/morpho-org/sdks/commit/401cf3244b32fcb00f6c7676b2a43e34a0283cad) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Add Arc chain metadata, deployment addresses, deployment block lower bounds, and native-token mapping.

  Patch maintained packages that depend directly on `@morpho-org/blue-sdk` so their latest releases resolve the new address registry.

- Updated dependencies [[`401cf32`](https://github.com/morpho-org/sdks/commit/401cf3244b32fcb00f6c7676b2a43e34a0283cad), [`738421e`](https://github.com/morpho-org/sdks/commit/738421e4a428ce361d2fe551746b0c406a0fe31f), [`6d59b5a`](https://github.com/morpho-org/sdks/commit/6d59b5abdcdab7f5da3df826ea4556899a5b765d), [`43e6cfc`](https://github.com/morpho-org/sdks/commit/43e6cfcf7eaab0355dccbe3f9f55c59cdac72f0a)]:
  - @morpho-org/blue-sdk@6.1.0
  - @morpho-org/morpho-ts@2.6.0

## 2.0.2

### Patch Changes

- [#742](https://github.com/morpho-org/sdks/pull/742) [`25ba440`](https://github.com/morpho-org/sdks/commit/25ba440e708a95770959af425f60ce82fdc553c7) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Fix npm source metadata by publishing full repository URLs and monorepo package directories.

- Updated dependencies [[`25ba440`](https://github.com/morpho-org/sdks/commit/25ba440e708a95770959af425f60ce82fdc553c7)]:
  - @morpho-org/blue-sdk@6.0.1
  - @morpho-org/morpho-ts@2.5.3

## 2.0.1

### Patch Changes

- Updated dependencies [[`c9796ab`](https://github.com/morpho-org/sdks/commit/c9796ab033c7fe3ac7241542f3b1a85d17e9b987)]:
  - @morpho-org/blue-sdk@6.0.0

## 2.0.0

### Major Changes

- [#635](https://github.com/morpho-org/sdks/pull/635) [`bb6d04a`](https://github.com/morpho-org/sdks/commit/bb6d04a0dd42666b29e79dd4c728810d500cafba) Thanks [@jinmel](https://github.com/jinmel)! - `SimulationResult` now carries per-transaction backend output and transfers
  include the originating transaction index.

  - New required field `calls: readonly SimulationCall[]` —
    `calls[i]` corresponds 1:1 with `simulationTxs[i]` and exposes the raw
    `logs`, `status`, `returnData`, `gasUsed`, and (Tenderly only) `assetChanges`
    for that transaction.
  - New required field `txIdx: number` on every `Transfer` — index into
    `simulationTxs` of the emitting transaction.
  - Removed the lossy top-level `assetChanges?: unknown` field. Use
    `calls[i].assetChanges` (per tx) instead. The previous top-level field
    only surfaced the last transaction's payload in bundle simulations.
  - New public type exports: `RawLog`, `SimulationCall`.
  - `SimulationResult.simulationTxs` and `SimulationResult.transfers` are now
    `readonly` arrays.

  **Migration:** consumers reading `result.assetChanges` should switch to
  `result.calls.at(-1)?.assetChanges`, or iterate `result.calls`
  when bundle-wide visibility is needed. Consumers reading `result.transfers`
  gain `txIdx` automatically; mapping a transfer back to its tx is
  `result.simulationTxs[transfer.txIdx]`.

### Patch Changes

- [#648](https://github.com/morpho-org/sdks/pull/648) [`1481e91`](https://github.com/morpho-org/sdks/commit/1481e91fd7e3382145b22d98c5156887c2b6496e) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Refresh packages that need a release after direct dependency, peer dependency, or source compatibility changes.

  - Update direct runtime dependency ranges for packages using `@noble/hashes`, `zod`, `@velora-dex/sdk`, `mutative`, `viem-deal`, and `viem-tracer`.
  - Widen React and TypeScript peer ranges in the Wagmi adapters only where the updated development dependencies require it, while preserving the previous lower-bound support.
  - Keep the SDK source compatible with the refreshed toolchain and libraries, including TypeScript 6, `@noble/hashes` 2.x subpath imports, TanStack Query/Wagmi inference changes, and viem error formatting; related tests/assertions were updated to match the refreshed dependencies.

- Updated dependencies [[`9dce8b7`](https://github.com/morpho-org/sdks/commit/9dce8b7047266badf7c7c813074a08f51ccb8c0a), [`1481e91`](https://github.com/morpho-org/sdks/commit/1481e91fd7e3382145b22d98c5156887c2b6496e)]:
  - @morpho-org/blue-sdk@5.23.3
