---
"@morpho-org/test": patch
---

Poll local Anvil test clients every 50 ms so transaction receipt waits return as soon as automined transactions are available instead of waiting for viem's default polling interval. The test client's `waitForTransactionReceipt` now skips viem's transaction replacement check by default: Anvil never replaces transactions, and the check could miss a block mined while it ran, leaving the wait to time out.
