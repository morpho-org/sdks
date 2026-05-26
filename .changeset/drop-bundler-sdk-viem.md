---
"@morpho-org/morpho-sdk": minor
---

Extract the Bundler3 action encoding surface needed by morpho-sdk so it no longer depends on @morpho-org/bundler-sdk-viem.

`BundlerAction.encodeBundle` now computes the native `tx.value` required by value-carrying Bundler3 calls, including `reallocateTo` fees in top-level and callback actions.
