---
"@morpho-org/blue-sdk": minor
"@morpho-org/morpho-sdk": minor
"@morpho-org/evm-simulation": patch
"@morpho-org/wdk-protocol-lending-morpho-evm": patch
---

Fail closed when positive debt requires an unsupported nonzero interest-rate model, while preserving exact zero-interest and zero-exposure calculations.

Treat accrual timestamps at or before a Blue market or Vault V2 snapshot's last update as a no-op: preserve its state and timestamp without projecting its IRM or charging new fees. Positions and Vault V1 allocations inherit the market behavior, while Vault V1 retains its existing loss and fee reconciliation. Rate and APY helpers evaluate earlier timestamps at the snapshot's last update.

Skip Vault V1 sources with zero allocator withdrawal capacity and Vault V1/V2 destinations with no remaining deposit capacity before projecting source interest.

Check Vault V2 minimum share minting requirements, supply-share limits, and every target absolute or zero relative cap before source projection when the candidate withdrawal cannot reduce that cap. Preserve shared-cap withdrawals and deposits whose allocation does not increase after rounding.
