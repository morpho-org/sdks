---
"@morpho-org/morpho-sdk": patch
"@morpho-org/midnight-sdk": patch
"@morpho-org/wdk-protocol-lending-morpho-evm": patch
---

Reject in-kind exit and permit deadlines outside uint256 before encoding or exposing approval requirements. Validate Vault V1 withdrawal utilization defaults and per-market overrides between zero and WAD. Allow Vault V2 in-kind exits when fetched market timestamps are ahead of the local clock, and pass market tick spacing in fixed-rate offer-chain examples.
