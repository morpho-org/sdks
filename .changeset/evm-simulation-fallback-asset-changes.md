---
"@morpho-org/evm-simulation": major
---

Harmonize `assetChanges` across both simulation backends into a single canonical
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
