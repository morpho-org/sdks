---
"@morpho-org/evm-simulation": major
---

`simulate()` no longer calls `eth_chainId` before simulating or re-fetches the state block after `eth_simulateV1` to check for a reorg. The new optional `block` parameter (`{ number, hash, timestamp }`, exported as `StateBlock`) skips the block lookup, so a simulation without quoted-asset metadata reads sends only `eth_simulateV1`. `block` cannot be combined with `blockNumber`.

Require `chainId` on every `SimulationTransaction`, matching `SimulateParams.chainId`. Reject missing, invalid or mismatched transaction chain IDs before RPC work. Preserve the chain ID in returned simulation transactions and send it as a hex quantity on every `eth_simulateV1` call, including authorization preparations and state reads, so supporting nodes reject a different target chain without an extra RPC request.

Migration: add `chainId` to every transaction passed to `simulate()`. See `docs/migrations/evm-simulation-v5-to-v6.md`.
