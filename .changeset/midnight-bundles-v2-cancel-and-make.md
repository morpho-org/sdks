---
"@morpho-org/morpho-sdk": major
"@morpho-org/wdk-protocol-lending-morpho-evm": patch
---

Publish Midnight maker offers atomically through MidnightBundlesV2. `client.morpho.midnight(chainId).cancelAndMakeLend` and `cancelAndMakeBorrow` replace `makeLend`, `makeBorrow`, and `supplyCollateralMakeBorrow`: one transaction cancels the replaced groups under `maxConsumed` guards, optionally supplies borrow collateral, activates a PriceRatifierV1 or RateRatifierV1 root, and publishes the payload for `msg.sender`. The pure `midnightCancelAndMake` builder also accepts an explicit delegated root signature. The MidnightMempool and SetterRatifier maker routes, Ecrecover offer-root signatures, and their exported types and errors are removed. New errors: `MidnightOfferRatifierMismatchError`, `MidnightReplacementGroupCancelledError`, `EmptyMidnightCollateralSuppliesError`. See `MIGRATION-v6-to-v7.md`.
