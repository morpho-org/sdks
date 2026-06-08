---
"@morpho-org/wdk-protocol-lending-morpho-evm": patch
---

Consume `@morpho-org/morpho-sdk` through the viem extension (`client.extend(morphoViemExtension(...)).morpho`) instead of the removed `MorphoClient` class. No change to the protocol adapter's public behavior.
