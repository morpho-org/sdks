# @morpho-org/evm-simulation

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
