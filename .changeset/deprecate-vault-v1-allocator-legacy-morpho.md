---
"@morpho-org/blue-sdk": minor
"@morpho-org/blue-sdk-viem": minor
"@morpho-org/liquidity-sdk-viem": minor
"@morpho-org/morpho-sdk": minor
"@morpho-org/morpho-ts": minor
"@morpho-org/evm-simulation": patch
"@morpho-org/wdk-protocol-lending-morpho-evm": patch
---

Deprecate all Vault V1 PublicAllocator surfaces, including raw ABIs, address and deployment registry fields, configuration models, fetchers, augmentation methods, and the liquidity loader. The existing V1 planning and transaction-composition deprecations continue to apply. Use Vault V2 BluePublicAllocator configurations and fetchers, `MorphoBlue.getVaultV2BlueReallocationData`, and `MorphoBlue.getVaultV2BlueReallocations` for new integrations.

Deprecate the legacy `morphoToken` address and the MORPHO legacy wrapping entries in `ethereumGeneralAdapter1Abi`. Use the current MORPHO token directly.

All deprecated exports, signatures, addresses, and transaction behavior remain available for compatibility until the next major release. General Vault V1 operations, Vault V2 allocator APIs, and other token wrapping flows remain supported.

Patch maintained runtime dependents so their next releases resolve the updated packages. Existing internal peer ranges accept these backward-compatible minor releases and require no changes.
