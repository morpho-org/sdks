---
"@morpho-org/wdk-protocol-lending-morpho-evm": patch
---

Track the `morpho-sdk` `MarketV1` → `Blue` rename: the internal Morpho market entity is now obtained via `client.blue(...)` instead of `client.marketV1(...)`. No public API change.
