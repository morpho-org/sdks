---
"@morpho-org/test": patch
---

Poll local Anvil test clients every 50 ms so transaction receipt waits return as soon as automined transactions are available instead of waiting for viem's default polling interval. The test client's `waitForTransactionReceipt` now polls `eth_getTransactionReceipt` directly: viem only re-fetches a missing receipt when a new block appears, so a transaction mined while that fetch was in flight could hang the wait forever under automine.
