---
"@morpho-org/liquidity-sdk-viem": patch
"@morpho-org/test": patch
"@morpho-org/wdk-protocol-lending-morpho-evm": patch
---

Refresh SDK dependencies and update TypeScript configuration and test helper types for TypeScript 7. No peer range widening was required; GraphQL remains on the latest compatible v16 because its direct consumers do not support v17. Remove the obsolete ox compatibility patch now fixed upstream.
