---
"@morpho-org/morpho-sdk": minor
---

Extract the Bundler3 action encoding surface needed by morpho-sdk so it no longer depends on @morpho-org/bundler-sdk-viem.

`BundlerAction.encodeBundle` now computes the native `tx.value` required by value-carrying Bundler3 calls, including `reallocateTo` fees in top-level and callback actions.

Adds `morphoSupply` and `morphoWithdraw` to the local Bundler3 action subset (action types, encoder functions, and `encode` dispatch), used by `marketV1Supply` / `marketV1Withdraw`. This keeps `@morpho-org/bundler-sdk-viem` a devDependency only — the published `morpho-sdk` tarball no longer imports it at runtime.
