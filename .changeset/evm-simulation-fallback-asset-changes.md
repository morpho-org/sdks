---
"@morpho-org/evm-simulation": major
---

Harmonize `assetChanges` across both simulation backends into a single canonical
shape, exposed as `SimulationResult.assetChanges`.

- New exported `AssetChange` type: `{ token, symbol?, decimals?, diff }`, the
  sender's net per-asset balance change over the whole bundle (native ETH uses
  viem's `ethAddress` sentinel as `token`).
- `eth_simulateV1` now derives `assetChanges` from the emitted transfer logs
  (sender's net per-token delta), matching the Tenderly shape; previously
  `assetChanges` was Tenderly-only and lost on the fallback path. Native ETH has
  no log and is not reported on the fallback path.
- Tenderly's per-transfer `assetChanges` payload is now schema-validated and
  reduced to the same `AssetChange[]` (net per token for the sender).

**Breaking:** the opaque per-call `SimulationCall.assetChanges?: unknown` field is
removed. Read the normalized bundle-level `SimulationResult.assetChanges` instead.
