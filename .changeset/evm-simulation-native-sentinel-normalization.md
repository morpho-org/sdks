---
"@morpho-org/evm-simulation": patch
---

Normalize the native-ETH sentinel case-insensitively when mapping Tenderly asset changes. A sentinel carried (checksummed or otherwise non-lowercase) in `assetInfo.contractAddress` was previously `getAddress`-checksummed and no longer matched the lowercase `ethAddress` key used by `assertNoBundlerRetention`, so a retained Bundler3 native residual could escape the retention gate and return a false-safe simulation. The transfer-log parser and the Tenderly asset-change mapper now share a single `normalizeAssetToken` helper, removing the drift between the two normalization paths.
