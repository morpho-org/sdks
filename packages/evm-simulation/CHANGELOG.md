# @morpho-org/evm-simulation

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
