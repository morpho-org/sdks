---
"@morpho-org/morpho-sdk": major
"@morpho-org/wdk-protocol-lending-morpho-evm": major
"@morpho-org/liquidity-sdk-viem": patch
---

Accept only Vault V2 BluePublicAllocator reallocations in high-level Morpho Blue write inputs.
Vault V1 planners and explicit low-level Bundler3 composition remain available. Update the WDK
borrow input and widen liquidity-sdk-viem's morpho-sdk peer range for the next major.
