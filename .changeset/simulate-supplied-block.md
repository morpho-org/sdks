---
"@morpho-org/evm-simulation": minor
---

`simulate()` no longer calls `eth_chainId` before simulating or re-fetches the state block after `eth_simulateV1` to check for a reorg. The new optional `block` parameter (`{ number, hash, timestamp }`, exported as `StateBlock`) skips the block lookup, so a simulation without quoted-asset metadata reads sends only `eth_simulateV1`. `block` cannot be combined with `blockNumber`.
