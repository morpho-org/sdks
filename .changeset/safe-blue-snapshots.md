---
"@morpho-org/blue-sdk": minor
"@morpho-org/morpho-sdk": minor
"@morpho-org/evm-simulation": patch
"@morpho-org/wdk-protocol-lending-morpho-evm": patch
---

Fail closed when positive debt requires an unsupported nonzero interest-rate model, while preserving exact zero-interest and zero-exposure calculations.

Skip Vault V1 sources with zero allocator withdrawal capacity before projecting interest.
