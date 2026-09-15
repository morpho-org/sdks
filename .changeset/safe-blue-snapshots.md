---
"@morpho-org/blue-sdk": minor
"@morpho-org/morpho-sdk": minor
"@morpho-org/evm-simulation": patch
"@morpho-org/wdk-protocol-lending-morpho-evm": patch
---

Fail closed when positive debt requires an unsupported nonzero interest-rate model, while preserving exact zero-interest and zero-exposure calculations.

Preserve explicit vault accrual timestamp validation for zero-share allocations without projecting their unsupported interest-rate models.

Skip Vault V1 sources with zero allocator withdrawal capacity and Vault V1/V2 destinations with no remaining deposit capacity before projecting source interest.

Check Vault V2 minimum share minting requirements, supply-share limits, and every target absolute or zero relative cap before source projection when the candidate withdrawal cannot reduce that cap. Preserve shared-cap withdrawals and deposits whose allocation does not increase after rounding.
