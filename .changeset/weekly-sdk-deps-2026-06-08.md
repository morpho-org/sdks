---
"@morpho-org/blue-sdk-viem": patch
"@morpho-org/wdk-protocol-lending-morpho-evm": patch
---

Refresh direct runtime dependencies as part of the weekly SDK dependency update.

Updated the WDK wallet/runtime dependencies for `@morpho-org/wdk-protocol-lending-morpho-evm`. Peer dependency ranges did not require widening for the updated devDependencies. Deprecated packages stayed frozen. The Biome schema was synchronized with the updated Biome devDependency, and checksum-address lint refreshed `@morpho-org/blue-sdk-viem` source examples for the updated `viem` checksum output.
