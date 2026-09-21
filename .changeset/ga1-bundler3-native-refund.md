---
"@morpho-org/morpho-sdk": patch
---

fix(morpho-sdk): encode `BundlerAction.nativeTransfer(generalAdapter1, bundler3, amount)` as a `GeneralAdapter1.nativeTransfer` call instead of silently dropping it (SDK-798)
