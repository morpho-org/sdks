---
"@morpho-org/evm-simulation": major
---

`SimulationResult` now carries per-transaction backend output and transfers
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
