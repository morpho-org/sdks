---
"@morpho-org/blue-sdk-viem": minor
"@morpho-org/morpho-sdk": minor
---

Reject Permit2 allowance values above the uint160 limit instead of silently converting them to unlimited approvals, and expose the typed overflow error through the Morpho SDK facade.
