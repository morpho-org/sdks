---
"@morpho-org/blue-sdk-viem": patch
---

Preserve the full uint256 allowance in Permit2 SignatureTransfer typed data instead of clamping it
to the uint160 AllowanceTransfer limit.
