# @morpho-org/test

## 2.15.0-next.0

### Minor Changes

- Add a reusable Base-fork fixture for Vault V2 Midnight adapters with an optional Vault V2 salt and factory durations.
- Align the Vault V2 Midnight adapter integration with the frozen `MidnightAdapter` interface (morpho-org/vault-v2@e7821fd). The adapter, factory and ratifier ABIs are regenerated, so the factory detects adapters with `isCreated`, `createMidnightAdapter` takes per-adapter `durations` and an `enterGateFactory`, and `maxTtm` changes through `increaseMaxTtm` and `decreaseMaxTtm`.

  `VaultV2MidnightAdapter` replaces `minRate`, `noSalesWithShortfall` and `noSalesBelowFaceValue` with `minNetBuyRate`, `maxNetSellRate` and `shortfallAllowance`, and adds `enterGateFactory`. Market data renames `rate` to `netRate` and adds `forceRemoved` and `minForceSellPrice`. `VaultV2MidnightAdapterUtils` returns the frozen cap ids (adapter, `familyCapId`, then one collateral-token id per collateral; duration ids use the `"this/duration"` tag) and values markets from live Midnight net credit once a market has a loss factor. The `VaultV2MidnightAdapterUtils` helpers `collateralParamsCapId`, `gateCapId` and `rcfThresholdCapId`, and the `VaultV2MidnightAdapter` statics `collateralParamsCapId`, `enterGateCapId`, `liquidatorGateCapId` and `rcfThresholdCapId`, are removed; use `familyCapId` and `collateralTokenCapId` instead.

  Vault exits through a Midnight liquidity adapter now follow the frozen adapter's `withdrawToVault` path. When `liquidityData` encodes a held, non-force-removed market of the vault asset, `AccrualVaultV2MidnightAdapter.maxWithdraw` returns the adapter's accrued credit capped by the market's `withdrawable` liquidity (limiter `liquidity`) instead of zero. Accrual snapshots carry the market's `withdrawable` liquidity (fetched from Midnight `marketState`), `VaultV2MidnightAdapterUtils` adds `marketId` and `maxWithdraw`, and morpho-sdk `withdraw` and `redeem` accept exits up to idle assets plus that amount. Deposits through a Midnight liquidity adapter still have zero capacity. `@morpho-org/morpho-ts` adds `MidnightMarketLib.id` (and `InvalidHexError`), the shared SSTORE2/CREATE2 market-id hash that both `VaultV2MidnightAdapterUtils.marketId` and midnight-sdk's `MarketUtils.toId` now call.

  `@morpho-org/test` adds `installMidnightAdapterFactory` (throwing `MidnightAdapterFactoryDeploymentError` or `MidnightAdapterFactoryCodeError`) and `MIDNIGHT_ADAPTER_IDLE_FUNDING_DATA` for fork tests.

### Patch Changes

- Retarget the prerelease-only Vault V2 Midnight adapter integration from vault-v2 `e7821fd` to `de2b5116eba5c03fb8e8ecfa9708569bc25c5ce1`. This updates the new Midnight surface before its first stable release; existing stable Blue adapter APIs are unchanged.

  `VaultV2MidnightAdapter.familyCapId` and `VaultV2MidnightAdapterUtils.familyCapId` now require `enterGate` alongside `collateralParams`, `rcfThreshold`, and `liquidatorGate`. They use the `"collateralParams/rcfThreshold/liquidatorGate/enterGate"` domain and include `enterGate` in the encoded tuple. Markets with different enter gates no longer share family caps. Recompute stored family-cap IDs; the previous `"family"` IDs target the old contracts, even for ungated markets.

  The canonical `midnightAdapterAbi` and its re-exported facades now reflect the pinned contract. Replace `setMinNetBuyRate`, `setMaxNetSellRate`, and `setShortfallAllowance` with their increase/decrease variants. Rate arguments remain absolute targets; shortfall allowance arguments are deltas. Submit and execute `decreaseMinNetBuyRate`, `increaseMaxNetSellRate`, and `increaseShortfallAllowance` through the adapter timelock, even when its delay is zero. Their counterparts are immediate curator calls. Updated events and rate-bound errors are included.

  The Base registry now points to the vault-v2 `bbeda7b` deployment of the Midnight adapter factory and its rate and price ratifiers, with their deployment blocks. The Base Midnight address is unchanged. Adapters created by the previous factory are not recognized by the new factory. Fork fixtures install the new factory at its registry address because their pinned block predates the deployment; deterministic fixture adapter addresses change. Upgrade the maintained packages together when using the new Midnight surface.

- Align morpho-ts peers with the 4.6.0 release line containing the shared Midnight ABIs and `MidnightPositionLib`. Blue SDK, Blue SDK Viem and Midnight SDK require `^4.6.0-0`, accepting the planned `4.6.0-next` prereleases while rejecting stable 4.5.0, which lacks these exports. Blue SDK Viem requires `@morpho-org/blue-sdk` `^8.5.0-0` for the Midnight adapter entities.

  The test packages retain their older stable morpho-ts alternatives and explicitly accept `4.6.0-next` prereleases. Only `@morpho-org/test/midnight` requires the new 4.6 exports; the root and `/fixtures` entrypoints remain independent of morpho-ts. Morpho Test also accepts Blue SDK 8.5, Test 2.15 and Midnight SDK 2.7 and 2.8 prereleases. Its Test peer is `^2.14.0 || ^2.15.0-0`: stable 2.14.0 contains the registry constants used by the shared fixtures, but the 2.14.0 prereleases do not.

- Refactor internal Anvil process, RPC proxy, and fixture helpers without changing the public API or behavior.
- The Vault V2 Midnight adapter fixture (`createVaultV2MidnightAdapterFixture`, `configureVaultV2MidnightAdapterCaps`, `takeVaultV2MidnightAdapterOffer`, `advanceVaultV2MidnightFixtureTime`, `BASE_MIDNIGHT_FORK_BLOCK_NUMBER`, `MAX_MIDNIGHT_ADAPTER_MARKETS` and their types) moves from the root and `/fixtures` entrypoints to the new `@morpho-org/test/midnight` subpath, and `@morpho-org/morpho-ts` becomes an optional peer dependency (`^2.7.0 || ^3.0.0 || ^4.0.0 || ^4.6.0-0`: the older stable alternatives plus the `4.6.0-next` prereleases) instead of a runtime dependency. The root and `/fixtures` helpers do not import morpho-ts, so they install and load with any morpho-ts version in that range or with none at all; only `@morpho-org/test/midnight` needs morpho-ts 4.6 or later (its `4.6.0-next` prereleases included), and projects that use it resolve one morpho-ts copy with a single set of error classes.
- Updated dependencies
  - @morpho-org/morpho-ts@4.6.0-next.0

## 2.14.0

### Minor Changes

- Export shared chain fork-block constants from `@morpho-org/test` and derive the E2E registry's Ethereum, Base, Optimism and Tempo targets from them. Require `@morpho-org/test` 2.14.0 or newer for the constants. Public Vitest and Playwright default fork blocks are unchanged.
- Disable opportunistic block access list cache prefill by default for Anvil forks. Pass `noBal: false` to retain Foundry's prefill; BAL RPC methods and local execution remain available.

  The default requires an Anvil that supports `--no-bal` (CI uses Foundry v1.10.0). Set `noBal: false` to avoid the flag on older Anvil versions.

### Patch Changes

- Preserve compatible Foundry RPC cache slots across parallel Anvil instances by isolating their writes and merging snapshots after shutdown.

  HTTP(S) and WebSocket forks use a private HOME while preserving standard mise data/configuration and asdf data paths. Other HOME-relative settings, including global tool-version files and Foundry configuration, are not carried over. Use an absolute `binary` path for unsupported shims, or `noStorageCaching` to retain the original HOME.

## 2.14.0-next.1

### Minor Changes

- Add a reusable Base-fork fixture for Vault V2 Midnight adapters with an optional Vault V2 salt and factory durations.
- Align the Vault V2 Midnight adapter integration with the frozen `MidnightAdapter` interface (morpho-org/vault-v2@e7821fd). The adapter, factory and ratifier ABIs are regenerated, so the factory detects adapters with `isCreated`, `createMidnightAdapter` takes per-adapter `durations` and an `enterGateFactory`, and `maxTtm` changes through `increaseMaxTtm` and `decreaseMaxTtm`.

  `VaultV2MidnightAdapter` replaces `minRate`, `noSalesWithShortfall` and `noSalesBelowFaceValue` with `minNetBuyRate`, `maxNetSellRate` and `shortfallAllowance`, and adds `enterGateFactory`. Market data renames `rate` to `netRate` and adds `forceRemoved` and `minForceSellPrice`. `VaultV2MidnightAdapterUtils` returns the frozen cap ids (adapter, `familyCapId`, then one collateral-token id per collateral; duration ids use the `"this/duration"` tag) and values markets from live Midnight net credit once a market has a loss factor. The `VaultV2MidnightAdapterUtils` helpers `collateralParamsCapId`, `gateCapId` and `rcfThresholdCapId`, and the `VaultV2MidnightAdapter` statics `collateralParamsCapId`, `enterGateCapId`, `liquidatorGateCapId` and `rcfThresholdCapId`, are removed; use `familyCapId` and `collateralTokenCapId` instead.

  Vault exits through a Midnight liquidity adapter now follow the frozen adapter's `withdrawToVault` path. When `liquidityData` encodes a held, non-force-removed market of the vault asset, `AccrualVaultV2MidnightAdapter.maxWithdraw` returns the adapter's accrued credit capped by the market's `withdrawable` liquidity (limiter `liquidity`) instead of zero. Accrual snapshots carry the market's `withdrawable` liquidity (fetched from Midnight `marketState`), `VaultV2MidnightAdapterUtils` adds `marketId` and `maxWithdraw`, and morpho-sdk `withdraw` and `redeem` accept exits up to idle assets plus that amount. Deposits through a Midnight liquidity adapter still have zero capacity. `@morpho-org/morpho-ts` adds `MidnightMarketLib.id` (and `InvalidHexError`), the shared SSTORE2/CREATE2 market-id hash that both `VaultV2MidnightAdapterUtils.marketId` and midnight-sdk's `MarketUtils.toId` now call.

  The Base `midnightAdapterFactory` registry entry still points at the pre-audit factory, which lacks `isCreated`; fetching adapters from that factory fails until the frozen factory is deployed and registered. `@morpho-org/test` adds `installMidnightAdapterFactory` (throwing `MidnightAdapterFactoryDeploymentError` or `MidnightAdapterFactoryCodeError`) and `MIDNIGHT_ADAPTER_IDLE_FUNDING_DATA` for fork tests.

### Patch Changes

- Align morpho-ts peers with the 4.5.0 release line containing the shared Midnight ABIs and `MidnightPositionLib`. Blue SDK, Blue SDK Viem and Midnight SDK require `^4.5.0-0`, accepting the planned `4.5.0-next` prereleases while rejecting stable 4.4.0, which lacks these exports. Blue SDK Viem requires `@morpho-org/blue-sdk` `^8.4.0-0` for the Midnight adapter entities.

  The test packages retain their older stable morpho-ts alternatives and explicitly accept `4.5.0-next` prereleases. Only `@morpho-org/test/midnight` requires the new 4.5 exports; the root and `/fixtures` entrypoints remain independent of morpho-ts. Morpho Test also accepts the matching Blue SDK 8.4, Test 2.14 and Midnight SDK 2.7 prereleases without dropping its older stable peer alternatives.

- The Vault V2 Midnight adapter fixture (`createVaultV2MidnightAdapterFixture`, `configureVaultV2MidnightAdapterCaps`, `takeVaultV2MidnightAdapterOffer`, `advanceVaultV2MidnightFixtureTime`, `BASE_MIDNIGHT_FORK_BLOCK_NUMBER`, `MAX_MIDNIGHT_ADAPTER_MARKETS` and their types) moves from the root and `/fixtures` entrypoints to the new `@morpho-org/test/midnight` subpath, and `@morpho-org/morpho-ts` becomes an optional peer dependency (`^2.7.0 || ^3.0.0 || ^4.0.0 || ^4.5.0-0`: the older stable alternatives plus the `4.5.0-next` prereleases) instead of a runtime dependency. The root and `/fixtures` helpers do not import morpho-ts, so they install and load with any morpho-ts version in that range or with none at all; only `@morpho-org/test/midnight` needs morpho-ts 4.5 or later (its `4.5.0-next` prereleases included), and projects that use it resolve one morpho-ts copy with a single set of error classes.
- Updated dependencies
  - @morpho-org/morpho-ts@4.5.0-next.1

## 2.14.0-next.0

### Minor Changes

- Add a reusable Base-fork fixture for Vault V2 Midnight adapters with an optional Vault V2 salt and factory durations.
- Align the Vault V2 Midnight adapter integration with the frozen `MidnightAdapter` interface (morpho-org/vault-v2@e7821fd). The adapter, factory and ratifier ABIs are regenerated, so the factory detects adapters with `isCreated`, `createMidnightAdapter` takes per-adapter `durations` and an `enterGateFactory`, and `maxTtm` changes through `increaseMaxTtm` and `decreaseMaxTtm`.

  `VaultV2MidnightAdapter` replaces `minRate`, `noSalesWithShortfall` and `noSalesBelowFaceValue` with `minNetBuyRate`, `maxNetSellRate` and `shortfallAllowance`, and adds `enterGateFactory`. Market data renames `rate` to `netRate` and adds `forceRemoved` and `minForceSellPrice`. `VaultV2MidnightAdapterUtils` returns the frozen cap ids (adapter, `familyCapId`, then one collateral-token id per collateral; duration ids use the `"this/duration"` tag) and values markets from live Midnight net credit once a market has a loss factor. The `VaultV2MidnightAdapterUtils` helpers `collateralParamsCapId`, `gateCapId` and `rcfThresholdCapId`, and the `VaultV2MidnightAdapter` statics `collateralParamsCapId`, `enterGateCapId`, `liquidatorGateCapId` and `rcfThresholdCapId`, are removed; use `familyCapId` and `collateralTokenCapId` instead.

  Vault exits through a Midnight liquidity adapter now follow the frozen adapter's `withdrawToVault` path. When `liquidityData` encodes a held, non-force-removed market of the vault asset, `AccrualVaultV2MidnightAdapter.maxWithdraw` returns the adapter's accrued credit capped by the market's `withdrawable` liquidity (limiter `liquidity`) instead of zero. Accrual snapshots carry the market's `withdrawable` liquidity (fetched from Midnight `marketState`), `VaultV2MidnightAdapterUtils` adds `marketId` and `maxWithdraw`, and morpho-sdk `withdraw` and `redeem` accept exits up to idle assets plus that amount. Deposits through a Midnight liquidity adapter still have zero capacity. `@morpho-org/morpho-ts` adds `MidnightMarketLib.id` (and `InvalidHexError`), the shared SSTORE2/CREATE2 market-id hash that both `VaultV2MidnightAdapterUtils.marketId` and midnight-sdk's `MarketUtils.toId` now call.

  The Base `midnightAdapterFactory` registry entry still points at the pre-audit factory, which lacks `isCreated`; fetching adapters from that factory fails until the frozen factory is deployed and registered. `@morpho-org/test` adds `installMidnightAdapterFactory` (throwing `MidnightAdapterFactoryDeploymentError` or `MidnightAdapterFactoryCodeError`) and `MIDNIGHT_ADAPTER_IDLE_FUNDING_DATA` for fork tests.

### Patch Changes

- `createMockClient` no longer retries failed RPC calls. Its transport now uses `retryCount: 0`, so a mocked error surfaces immediately instead of after viem's default three retries with backoff (about 1 second per failing call), and `request` is called once per RPC call.
- Align morpho-ts peers with the 4.5.0 release line containing the shared Midnight ABIs and `MidnightPositionLib`. Blue SDK, Blue SDK Viem and Midnight SDK require `^4.5.0-0`, accepting the planned `4.5.0-next` prereleases while rejecting stable 4.4.0, which lacks these exports. Blue SDK Viem requires `@morpho-org/blue-sdk` `^8.4.0-0` for the Midnight adapter entities.

  The test packages retain their older stable morpho-ts alternatives and explicitly accept `4.5.0-next` prereleases. Only `@morpho-org/test/midnight` requires the new 4.5 exports; the root and `/fixtures` entrypoints remain independent of morpho-ts. Morpho Test also accepts the matching Blue SDK 8.4, Test 2.14 and Midnight SDK 2.7 prereleases without dropping its older stable peer alternatives.

- The Vault V2 Midnight adapter fixture (`createVaultV2MidnightAdapterFixture`, `configureVaultV2MidnightAdapterCaps`, `takeVaultV2MidnightAdapterOffer`, `advanceVaultV2MidnightFixtureTime`, `BASE_MIDNIGHT_FORK_BLOCK_NUMBER`, `MAX_MIDNIGHT_ADAPTER_MARKETS` and their types) moves from the root and `/fixtures` entrypoints to the new `@morpho-org/test/midnight` subpath, and `@morpho-org/morpho-ts` becomes an optional peer dependency (`^2.7.0 || ^3.0.0 || ^4.0.0 || ^4.5.0-0`: the older stable alternatives plus the `4.5.0-next` prereleases) instead of a runtime dependency. The root and `/fixtures` helpers do not import morpho-ts, so they install and load with any morpho-ts version in that range or with none at all; only `@morpho-org/test/midnight` needs morpho-ts 4.5 or later (its `4.5.0-next` prereleases included), and projects that use it resolve one morpho-ts copy with a single set of error classes.
- Updated dependencies
  - @morpho-org/morpho-ts@4.5.0-next.0

## 2.13.1

### Patch Changes

- `createMockClient` no longer retries failed RPC calls. Its transport now uses `retryCount: 0`, so a mocked error surfaces immediately instead of after viem's default three retries with backoff (about 1 second per failing call), and `request` is called once per RPC call.

## 2.13.0

### Minor Changes

- Export the installed package version as a browser-safe `version` constant from the package root.

  If you `export *` from more than one Morpho package, their `version` exports conflict. Pick one with an explicit `export { version } from "@morpho-org/test"`, which takes precedence over the wildcards, and alias any others, for example `export { version as testVersion } from "@morpho-org/test"`.

## 2.13.0-next.1

### Minor Changes

- Add a reusable Base-fork fixture for Vault V2 Midnight adapters with an optional Vault V2 salt and factory durations.

### Patch Changes

- The Vault V2 Midnight adapter fixture (`createVaultV2MidnightAdapterFixture`, `configureVaultV2MidnightAdapterCaps`, `takeVaultV2MidnightAdapterOffer`, `advanceVaultV2MidnightFixtureTime`, `BASE_MIDNIGHT_FORK_BLOCK_NUMBER`, `MAX_MIDNIGHT_ADAPTER_MARKETS` and their types) moves from the root and `/fixtures` entrypoints to the new `@morpho-org/test/midnight` subpath, and `@morpho-org/morpho-ts` becomes an optional peer dependency (`^2.7.0 || ^3.0.0 || ^4.0.0 || ^4.3.0-0`: the range `@morpho-org/morpho-test` already accepts, plus the `4.3.0-next` prereleases) instead of a runtime dependency. The root and `/fixtures` helpers do not import morpho-ts, so they install and load with any morpho-ts version in that range or with none at all; only `@morpho-org/test/midnight` needs morpho-ts 4.3 or later (its `4.3.0-next` prereleases included), and projects that use it resolve one morpho-ts copy with a single set of error classes.
- Updated dependencies
  - @morpho-org/morpho-ts@4.3.0-next.0

## 2.13.0-next.0

### Minor Changes

- Add a reusable Base-fork fixture for Vault V2 Midnight adapters with an optional Vault V2 salt and factory durations.

### Patch Changes

- Updated dependencies
  - @morpho-org/morpho-ts@4.2.0-next.1

## 2.12.1

### Patch Changes

- Correct Anvil fork header serialization and allow silent nodes to complete startup with explicit or automatic ports. Read the current automine setting for each send, compare bigint approximate assertions without floating-point amount conversion, and preserve caller parameters in the approve and deposit helpers, including frozen objects.
- Classify MalformedSignatureError and InvalidEcrecoverSignatureError as auth errors in the chaos error classification rules.

## 2.12.0

### Minor Changes

- Add `client.setFeeTokenBalance` to fund local test accounts on chains that charge gas in an ERC-20 fee token.

### Patch Changes

- Accept authorization descriptors in final mode and require matching user-call Approval events for ERC-2612 permits and IncrementNonce events for Blue signatures. Throw UnusedAuthorizationError with the request index when the evidence is missing, even with limits disabled. Preview preparation is unchanged.

## 2.11.0

### Minor Changes

- Return Tempo to the E2E matrix, superseding the Tempo omission in `e2e-fallback-asset`.
  `createViemTest` from `@morpho-org/test/vitest` now funds the test account's pathUSD fee-token
  balance on Tempo and throws `AnvilFeeTokenFundingError` if the write does not produce the expected
  balance.
  `@morpho-org/morpho-test` now requires `@morpho-org/test` `^2.11.0`.
- Fail closed on missing contract code: Blue, VaultV1 and VaultV2 `getRequirements()` now throw `MissingContractCodeError` when a registered bundles or protocol target holds no code, and `simulate()` rejects calldata transactions to code-less addresses with `SimulationValidationError` before `eth_simulateV1`. `@morpho-org/test` classifies the new error as `config`, `classifyError` now maps `BlacklistViolationError` to `config` and `ConsumerLimitViolationError` to `revert` where both were previously `unknown`, and `createMockClient` now answers `eth_getCode` with non-empty bytecode by default. `getBundlesTokenRequirements`, `getVaultBundlesSharesRequirements` and `getBlueAuthorizationRequirement` accept an optional `now` timestamp override for their deadline checks and pass it through to the signature encoders; `resolveBundlesTokenRequirements`, `encodeErc20Permit`, `encodeErc20Permit2SignatureTransfer`, `encodeVaultSharesPermit` and `encodeBlueSignatureAuthorization` accept the same optional `now` (additive). Migrate with packages/morpho-sdk/MIGRATION-v7-to-v8.md.
- Add the `@morpho-org/test/chaos` subpath exporting `createFaultProxy`, `fault`, `classifyError`, and `expectFailClosed`.

  The subpath also exports `FaultProxyInternalError`. Fault-proxy teardown throws this error when
  request processing failed, so broken fixtures cannot pass silently.

- Add `getErpcForkUrl` for authenticated Morpho eRPC fork URLs.

### Patch Changes

- Anvil test clients with automine enabled now wait for the local block number to advance after `writeContract`, `sendTransaction` and `sendRawTransaction` before polling the receipt, so receipt lookups that race automining are no longer forwarded to the fork RPC. The 180 s receipt timeout is unchanged.
- Normalize WDK provider transport failures, reconcile failover rejections that may follow an earlier accepted broadcast, and expose typed errors for uncertain EOA broadcasts (including gateway errors) and malformed transaction hashes, classifying invalid hashes as integrity failures.

  Provider errors follow viem's own retry rules. Network and timeout failures, JSON-RPC codes -32005 and -32603, HTTP 429, and retryable HTTP statuses are still retried; other JSON-RPC codes, such as -32000 ("header not found"), now fail immediately instead of after viem retries. See MIGRATION.md under "Migrating to 3.0" for the provider and submission error changes.

- `fetchToken` no longer defaults `decimals` to 0: it throws `UnknownTokenError` when `decimals()` is absent or out of range, and propagates transport errors from every metadata read instead of returning undefined fields. `getPermitTypedData` throws `MissingPermitDomainNameError` when neither `name()` nor `eip712Domain()` is available. `name`, `symbol` and `eip712Domain` resolve to `undefined` only on revert or no code; a malformed `eip712Domain()` or `bytes32` result throws the new `MalformedTokenMetadataError`. With `useSimplePermit`, transport errors from the ERC-2612 `nonces()` probe now propagate; fallback is limited to recognized reverts or undecodable return data. Adds the `isUndecodableResultError` helper. Migrate with packages/blue-sdk-viem/MIGRATION-v6-to-v7.md, packages/morpho-sdk/MIGRATION-v7-to-v8.md and packages/wdk-protocol-lending-morpho-evm/MIGRATION.md.
- `classifyError` classifies `DepositOwnerMismatchError`, `DepositSpenderMismatchError`, `DepositAssetMismatchError` and `DepositAmountMismatchError` as `auth`, and a `SimulationRevertedError` whose `revertData` starts with a Permit2 or bundles signature, nonce or deadline error selector (`DeadlinePassed()`, `InvalidNonce()`, `SignatureExpired(uint256)`, `InvalidSigner()`, `InvalidSignature()`, `InvalidSignatureLength()`, `InvalidContractSignature()`) as `auth`.
- `classifyError` maps `SlippageCheckUnavailableError` to `integrity`.
- `spawnAnvil` no longer fails to start when the fork RPC is slow or fails on Anvil's `anvil_nodeInfo` startup probe. Through the Morpho eRPC, that probe averages 21 s on HyperEVM and the CDN answers HTTP 504. Alchemy rejects it with error -32600, which Anvil 1.8 doesn't accept either. Anvil now reaches an `http(s)` `forkUrl` through a local proxy on 127.0.0.1, closed when Anvil stops. The proxy answers the probe with -32601, alone or in a batch, and forwards every other request unchanged. Anvil names its fork disk cache after the fork URL, so it gets `http://fork-<hash of the fork URL>.invalid` and reaches the proxy through `HTTP_PROXY`: each fork URL keeps the same cache file across runs and processes. A trailing `@<block>` on `forkUrl` and `forkHeader` keep working. The proxy never puts the fork URL in errors. When `HTTP_PROXY`, `HTTPS_PROXY` or `ALL_PROXY` is set, Anvil forks directly through that proxy as before, because the local proxy can't reach the fork RPC through it.
- `createAnvilTestClient` answers `eth_getTransactionReceipt` with null while the transaction is still in Anvil's pool (checked with `txpool_content`, which Anvil answers locally), without sending the lookup to Anvil. Anvil forwards a receipt lookup it can't answer to the fork RPC, and a caching RPC such as the Morpho eRPC can take seconds to return null for a hash only Anvil knows, which made heavy fork tests time out. This covers every receipt lookup made through the client, including viem-tracer's check after each send.

## 2.10.1

### Patch Changes

- [#1289](https://github.com/morpho-org/sdks/pull/1289) [`579b7ef`](https://github.com/morpho-org/sdks/commit/579b7efe6e6ca82a5705cd6e6b1ab7f6c5e093cf) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Poll local Anvil test clients every 50 ms so transaction receipt waits return as soon as automined transactions are available instead of waiting for viem's default polling interval. When called with only `hash` and `timeout`, the test client's `waitForTransactionReceipt` now polls `eth_getTransactionReceipt` directly. viem only re-fetches a missing receipt when a new block appears, so a transaction mined while that fetch was in flight could hang the wait forever under automine. Calls that pass any other option still use viem's implementation.

## 2.10.0

### Minor Changes

- [#941](https://github.com/morpho-org/sdks/pull/941) [`86bf42c`](https://github.com/morpho-org/sdks/commit/86bf42ca1ecf167da2cb4674d4f05f785d49c5d9) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Stop retrying failed JSON-RPC requests from Vitest clients to local Anvil processes so transport errors surface without duplicating RPC work.

  Support Anvil's Optimism Karst hardfork so Base fork tests can execute Osaka EVM bytecode with Foundry v1.8.0.

## 2.9.0

### Minor Changes

- [#944](https://github.com/morpho-org/sdks/pull/944) [`3fe836b`](https://github.com/morpho-org/sdks/commit/3fe836b3374a2d8896d0b7bdbba36fd30aa120b0) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Make unexpected Anvil exits and failed shutdowns surface without poisoning Vitest retries, clean up child processes when startup fails, cover the configured fork retry budget with an overridable startup deadline, let state dumps finish gracefully by default with a configurable force-kill delay, and redact exact fork URLs and header values from Anvil diagnostics in CI unless explicitly disabled.

  Require Vitest 2.1.2 or newer so per-attempt cleanup failures participate in Vitest retries.

  This minor release intentionally makes the existing `spawnAnvil()` result fields (`rpcUrl` and `stop`) and `ViemTestContext.client` readonly. This is a source-level breaking change for consumers that assign those fields; keep mutable wrapper objects locally if reassignment is required.

## 2.8.4

### Patch Changes

- [#914](https://github.com/morpho-org/sdks/pull/914) [`d45fffa`](https://github.com/morpho-org/sdks/commit/d45fffad3b2d6f5182b1a0d31a7d8a55cf4eaad2) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Refresh SDK dependencies and update TypeScript configuration and test helper types for TypeScript 7. No peer range widening was required; GraphQL remains on the latest compatible v16 because its direct consumers do not support v17. Remove the obsolete ox compatibility patch now fixed upstream.

## 2.8.3

### Patch Changes

- [#815](https://github.com/morpho-org/sdks/pull/815) [`e7578c3`](https://github.com/morpho-org/sdks/commit/e7578c3c205c3559bf1b7498030d818a0cc04220) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Add first-iteration Midnight action flows under `client.morpho.midnight(chainId)`, expose Midnight SDK API helpers through `morpho-sdk/midnight-api` and shared ABI/constant/error/utility entrypoints, and expose pure Midnight transaction builders for the markets-app taker, maker, redeem, repay/withdraw, and cancel flows.

  The Midnight entity returns lazy action outputs with `getRequirements()` and synchronous `buildTx(...)` methods, matching the existing `morpho-sdk` action pattern while accepting fixed-rate API quote takeable offers directly. UI labels, rate display logic, and offer-chain presentation stay on the integrator side.

  Midnight market transaction builders are synchronous and consume caller-provided `marketData` state, while `redeem` consumes a single caller-provided `positionData` snapshot that includes its hydrated market. Maker-offer action builders consume caller-provided `offersData` from `getOffersData(...)`, which creates the tree from the same entries accepted by `Tree.create(...)` and runs mempool validation. `getMarketData(...)`, `getPositionData(...)`, and `getOffersData(...)` remain async helpers so integrators can prepare state once, compose UI/validation around it, and then build transactions without hidden reads. Callers can pin several reads to one externally fetched block by forwarding its `blockNumber` through the fetch parameters.

  Midnight Bundles token pulls use approval-based execution in this first iteration: `getRequirements()` returns ERC20 approval calls, and encoded bundle calls pass `PermitKind.None`. ERC2612 token permits, Permit2 SignatureTransfer token pulls, unit-target take helpers, exposed taker `reduceOnly`, referral fee controls, max-continuous-fee controls, and generic collateral withdrawal lists are left to follow-up work.

  Allow fork tests to select Anvil's Osaka hardfork so deployed Midnight bytecode using the `CLZ` opcode can be exercised end to end.

  Borrow-side flows are explicit: `takeBorrow` and `makeBorrow` borrow without supplying collateral, while `supplyCollateralTakeBorrow` and `supplyCollateralMakeBorrow` perform collateral-supply plus borrow flows. Public maker flows are exposed through async entity methods such as `makeLend`, `makeBorrow`, and `supplyCollateralMakeBorrow`; they accept raw offer or group inputs, prepare and validate `offersData` internally, then return lazy requirement and transaction handles. Maker submit metadata exposes all submitted group ids, and the ratifier helpers enforce that the submitted tree uses one ratifier.

  Named take transaction builders validate that their takeable offers match the expected maker side, and named maker entity flows validate that prepared maker trees match the expected maker side. Borrow takes require a positive `maxUnits`, repayment-withdrawal flows reject unknown collateral indexes before exposing requirements, and partial group cancellation rejects amounts outside the onchain offer-cap range. `getOffersData(...)` stays side-agnostic so callers can prepare any valid tree.

  Validation runs before requirements are exposed: takeable offers must match the requested flow, redemption cannot exceed position credit, approval amounts and operators are checked before allowance short-circuits, and market inputs must belong to the selected Midnight deployment. Maker preparation also preserves caller-owned offer group arrays.

  Bind security-sensitive flow artifacts to their preparation context: Ecrecover submissions use the canonical payload retained for the signed tree instead of trusting payload bytes supplied to `buildTx`, typed-data signing rejects wallets on another chain, and redemption accepts only owner-bound position snapshots for the requested account.

## 2.8.2

### Patch Changes

- [#849](https://github.com/morpho-org/sdks/pull/849) [`ca3d727`](https://github.com/morpho-org/sdks/commit/ca3d7276012f37238646f99212ee12416aba2b43) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Harden Midnight SDK API, fetch, offer, group, tree, and package-export behavior for Cantina audit findings.

## 2.8.1

### Patch Changes

- [#742](https://github.com/morpho-org/sdks/pull/742) [`25ba440`](https://github.com/morpho-org/sdks/commit/25ba440e708a95770959af425f60ce82fdc553c7) Thanks [@Rubilmax](https://github.com/Rubilmax)! - Fix npm source metadata by publishing full repository URLs and monorepo package directories.

## 2.8.0

### Minor Changes

- [#596](https://github.com/morpho-org/sdks/pull/596) [`79443e5`](https://github.com/morpho-org/sdks/commit/79443e5814e939428b7e5bbeb30729903305cf81) Thanks [@0xbulma](https://github.com/0xbulma)! - Add `./mock` sub-export providing `createMockClient`, `mockRead`, and `expectReadCall` for transport-level viem mocking in unit tests. The mock installs a `vi.fn`-backed `custom()` transport on a real viem `Client`, so SDK code that uses `viem/actions` named imports (e.g. `readContract(client, …)`) resolves through it just as it would against a live RPC. `mockRead` matches every overload of a function name, so reads against contracts with overloaded `view`/`pure` methods don't silently miss.

### Patch Changes

- [#596](https://github.com/morpho-org/sdks/pull/596) [`79443e5`](https://github.com/morpho-org/sdks/commit/79443e5814e939428b7e5bbeb30729903305cf81) Thanks [@0xbulma](https://github.com/0xbulma)! - `mockRead` (from `@morpho-org/test/mock`) now ABI-encodes the supplied `result` **per overload** of the target function name rather than once against the ambiguous `functionName`. For ABIs where overloads share a return type the behaviour is unchanged (the same bytes are stored under every selector). For ABIs where overloads have **different** return types — e.g. `counter(uint256) returns (uint256)` and `counter(address) returns (bool)` — the encoded bytes now match each overload's declared output shape, so an `eth_call` to the bool overload no longer receives uint256-shaped bytes. If the supplied `result` does not match the return shape of **any** overload, `mockRead` now throws a clear `Error` (`"[mockRead] options.result does not match any return-type shape of overloads of <name>"`) instead of silently registering bytes that decode incorrectly.

  (Drive-by packaging cleanup: the previously-advertised CJS `require` condition for `./mock` is removed from `publishConfig.exports` and `mock.ts` is excluded from the CJS build. The entry was crash-on-load — `mock.ts` imports vitest, which rejects `require()` — so no working consumer is affected; only the unusable metadata is gone.)

## 2.7.3

### Patch Changes

- [#648](https://github.com/morpho-org/sdks/pull/648) [`1481e91`](https://github.com/morpho-org/sdks/commit/1481e91fd7e3382145b22d98c5156887c2b6496e) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Refresh packages that need a release after direct dependency, peer dependency, or source compatibility changes.

  - Update direct runtime dependency ranges for packages using `@noble/hashes`, `zod`, `@velora-dex/sdk`, `mutative`, `viem-deal`, and `viem-tracer`.
  - Widen React and TypeScript peer ranges in the Wagmi adapters only where the updated development dependencies require it, while preserving the previous lower-bound support.
  - Keep the SDK source compatible with the refreshed toolchain and libraries, including TypeScript 6, `@noble/hashes` 2.x subpath imports, TanStack Query/Wagmi inference changes, and viem error formatting; related tests/assertions were updated to match the refreshed dependencies.
