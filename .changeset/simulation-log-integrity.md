---
"@morpho-org/evm-simulation": patch
---

Harden simulation backend integrity and WETH9 log pairing:

- `simulateTenderlyRpc` now throws `ExternalServiceError` when `tenderly_simulateBundle` returns a different number of results than transactions submitted, so `executeSimulation` falls back to `eth_simulateV1` instead of failing the request.
- `parseTransfers` compares log `address`/`topics`/`data` case-insensitively when recognising ERC-20 `Transfer` and WETH9 `Deposit`/`Withdrawal` events.
- WETH9 wrap/unwrap deduplication is now one-to-one: each `Deposit`/`Withdrawal` absolves at most one matching zero-address `Transfer`, so duplicate mint/burn transfers are no longer silently dropped.
