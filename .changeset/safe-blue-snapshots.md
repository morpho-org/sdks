---
"@morpho-org/blue-sdk": minor
"@morpho-org/morpho-sdk": minor
"@morpho-org/evm-simulation": patch
"@morpho-org/wdk-protocol-lending-morpho-evm": patch
---

Fail closed when positive debt requires an unsupported nonzero interest-rate model, while preserving exact zero-interest and zero-exposure calculations.

Skip Vault V1 sources with zero allocator withdrawal capacity and Vault V1/V2 destinations with no remaining deposit capacity before projecting source interest.

Check Vault V2 supply-share limits, target-market absolute caps, and zero relative caps before source projection, while preserving deposits whose allocation does not increase after rounding.
