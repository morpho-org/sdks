---
"@morpho-org/morpho-sdk": major
---

Resolve the Permit2 SignatureTransfer nonce automatically in `getBundlesTokenRequirements` (and every entity `getRequirements()`) when no `permit2Nonce` is passed, using the lowest unused nonce from `getUnusedPermit2Nonce`. `getRequirements()` now throws `NoUnusedPermit2NonceError` (when every nonce is consumed) instead of the removed `MissingPermit2SignatureTransferNonceError` / `MissingPermit2TransferFromNonceError`.
