---
"@morpho-org/morpho-sdk": patch
---

Reject a vault-share permit whose supplied `action.args.nonce` disagrees with `args.nonce` in `getBundlesSharesPermit` with `BundlesPermitMismatchError`, matching the existing amount and deadline cross-checks, so a malformed requirement signature can never forward a lower nonce that the bundles peripheries' shared `TokenLib.submitPermit` (VaultBundlesV1 and VaultExitBundlesV1) would treat as an already-consumed permit.
