# @morpho-org/evm-simulation

## 4.1.0

### Minor Changes

- [#803](https://github.com/morpho-org/sdks/pull/803) [`7157a55`](https://github.com/morpho-org/sdks/commit/7157a5526af51fe7fc817f39e2cc4a799b3ae483) Thanks [@Foulks-Plb](https://github.com/Foulks-Plb)! - Enable `traceTransfers` on the `eth_simulateV1` backend so native-ETH moves — including ETH moved through internal calls (e.g. a `WETH.withdraw` refund) — are captured in `assetChanges`. The node synthesizes native transfers as `Transfer` logs from the native sentinel, which `parseTransfers` normalizes to viem's `ethAddress`. Native ETH is now derived entirely from these logs instead of the top-level transaction `value`, closing the prior coverage gap where the `eth_simulateV1` path missed internally-moved ETH (Tenderly already reported it). Both backends now report the full net native-ETH delta.

  The sender ETH balance override now uses half of `uint256` instead of the `uint256` ceiling, leaving headroom for inbound native ETH. Pinning the sender at `maxUint256` overflowed the recipient balance whenever the simulated calls paid native ETH back to the sender (e.g. a `WETH.withdraw` refund), reverting the value transfer.

### Patch Changes

- [#828](https://github.com/morpho-org/sdks/pull/828) [`830c27e`](https://github.com/morpho-org/sdks/commit/830c27ecfde39d371f406475e3a7edb79ae41da1) Thanks [@prd-carapulse](https://github.com/apps/prd-carapulse)! - Add World Chain USDC with permit version 2 support to the shared address registry.

  Normalize fallback Circle permit token address checks so known USDC/EURC addresses use permit domain version `"2"` regardless of caller-provided address casing.

  Patch maintained packages with direct runtime dependencies on `@morpho-org/morpho-ts` so their latest releases resolve the new registry entry.

- [#712](https://github.com/morpho-org/sdks/pull/712) [`93f0c1a`](https://github.com/morpho-org/sdks/commit/93f0c1a2f923d0047c421049f7ffab8f0d66d0c4) Thanks [@0xbulma](https://github.com/0xbulma)! - Move shared Blue and Midnight SDK primitives to `@morpho-org/morpho-ts`: chain metadata, address/deployment registries, fixed-point math helpers, shared bigint types, typed registry/math errors, `ORACLE_PRICE_SCALE`, and `assertNonNegative`.

  Expose shared ABI literals through `@morpho-org/morpho-ts/abis` so root utility imports do not load the ABI table.

  Model addresses as a unified flat Morpho registry so Blue and Midnight addresses live on the same chain entry and resolve through the protocol-agnostic `getChainAddresses`, `getChainAddress`, and `registerCustomAddresses` helpers.

  Keep `@morpho-org/blue-sdk` compatible by re-exporting the extracted chain, address, math, and error surfaces from `@morpho-org/morpho-ts`, and remove the now-unused lodash registry merge dependencies from `@morpho-org/blue-sdk`.

  Expose the shared address registry helpers and registry types through `@morpho-org/morpho-sdk` so integrators can import the cross-protocol address surface from the main SDK package.

  Update maintained dependents of `@morpho-org/blue-sdk` and `@morpho-org/morpho-ts`, including peer dependents, so published packages resolve the extracted shared primitives used by the Blue SDK compatibility layer.

- Updated dependencies [[`830c27e`](https://github.com/morpho-org/sdks/commit/830c27ecfde39d371f406475e3a7edb79ae41da1), [`93f0c1a`](https://github.com/morpho-org/sdks/commit/93f0c1a2f923d0047c421049f7ffab8f0d66d0c4)]:
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
