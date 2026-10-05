---
"@morpho-org/morpho-sdk": major
---

Route Midnight `takeLend`, `takeBorrow` and `supplyCollateralTakeBorrow` through MidnightBundlesV2 for `msg.sender`. Each takes a `target` union that selects the assets-target or units-target entrypoint (`MidnightBuyTarget` for lends, `MidnightSellTarget` for borrows) instead of `assets`/`minUnits` or `loanAssets`/`maxUnits`; the `taker` input is removed. `takeLend` requires `maxContinuousFee`; all three accept an optional referral fee, and the borrows an optional `receiver`. `supplyCollateralTakeBorrow` takes a non-empty `collateralSupplies` list. Requirements approve tokens to and authorize MidnightBundlesV2. `MidnightCollateralSupply` is removed. See `MIGRATION-v6-to-v7.md`.
