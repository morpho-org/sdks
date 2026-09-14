---
"@morpho-org/morpho-sdk": minor
---

Resolve the Permit2 SignatureTransfer nonce automatically in `getBundlesTokenRequirements` (and every entity `getRequirements()`) when no `permit2Nonce` is passed, using the lowest unused nonce from `getUnusedPermit2Nonce`. `MissingPermit2SignatureTransferNonceError` is no longer thrown and is deprecated.
