---
"@morpho-org/morpho-sdk": minor
---

Adds `morphoSupply` and `morphoWithdraw` to the local Bundler3 action subset (action types, encoder functions, and `encode` dispatch), used by `marketV1Supply` / `marketV1Withdraw`. This keeps `@morpho-org/bundler-sdk-viem` a devDependency only — the published `morpho-sdk` tarball no longer imports it at runtime.
