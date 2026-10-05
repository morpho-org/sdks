---
"@morpho-org/test": patch
---

Poll local Anvil test clients every 50 ms so transaction receipt waits return as soon as automined transactions are available instead of waiting for viem's default polling interval.
