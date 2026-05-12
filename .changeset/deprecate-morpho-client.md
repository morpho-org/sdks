---
"@morpho-org/morpho-sdk": minor
---

Deprecate `MorphoClient` in favor of `morphoViemExtension`. Extend a viem public (or wallet) client with `morphoViemExtension(...)` and use `client.morpho.vaultV1 / vaultV2 / marketV1` instead of constructing `MorphoClient` directly. `MorphoClient` will be removed in the next major release.
