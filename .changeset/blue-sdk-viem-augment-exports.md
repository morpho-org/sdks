---
"@morpho-org/blue-sdk-viem": patch
---

Expose the documented augmentation subpaths: `package.json` now exports `./augment` and `./augment/*` (dev exports map to `src/augment`, `publishConfig.exports` to `lib/{esm,cjs}/augment`), so `import "@morpho-org/blue-sdk-viem/augment/Market"` and friends resolve instead of throwing `ERR_PACKAGE_PATH_NOT_EXPORTED`. The `sideEffects` manifest field now protects the augmentation modules from tree-shaking, and the README uses the new subpaths (dropping the non-existent `augment/AccrualPosition` entry — `augment/Position` augments `Position`, `AccrualPosition`, and `PreLiquidationPosition` — and adding the missing `augment/User`).

Refs SDK-1100
