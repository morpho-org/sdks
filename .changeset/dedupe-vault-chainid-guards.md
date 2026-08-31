---
"@morpho-org/morpho-sdk": patch
---

Route the `MorphoVaultV1` and `MorphoVaultV2` action-method chain checks through the shared `validateChainId` helper instead of inlining the `ChainIdMismatchError` guard at each call site. Pure internal maintenance: the thrown error class and arguments are unchanged, and the `getData` guards keep their intentional chainless-client tolerance.
